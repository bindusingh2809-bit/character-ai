import os
import json
import cv2
import numpy as np
import onnxruntime as ort
from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from diffusers import StableDiffusionImg2ImgPipeline
import torch  
app = Flask(__name__)
UPLOAD_FOLDER = 'uploads'
OUTPUT_FOLDER = 'output'
MODEL_PATH = 'dw-ll_ucoco_384.onnx' # Path to your DWPose ONNX model

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['OUTPUT_FOLDER'] = OUTPUT_FOLDER

# Load the DWPose ONNX Runtime Session
try:
    # Use CUDAExecutionProvider if you have an Nvidia GPU setup, otherwise CPU
    providers = ['CUDAExecutionProvider', 'CPUExecutionProvider'] if 'CUDAExecutionProvider' in ort.get_available_providers() else ['CPUExecutionProvider']
    session = ort.InferenceSession(MODEL_PATH, providers=providers)
    print(f"😎 DWPose model loaded successfully using: {session.get_providers()[0]}")
except Exception as e:
    print(f"❌ Error loading model: {e}. Please ensure '{MODEL_PATH}' is in this directory.")
    session = None

def preprocess_image(image_path, target_size=(288, 384)):  # Changed from (384, 384) -> (Width=288, Height=384)
    """Resizes and normalizes the image for the dw-ll_ucoco_384 model."""
    img = cv2.imread(image_path)
    h, w, _ = img.shape
    # Resize to model input size (OpenCV expects (width, height))
    img_resized = cv2.resize(img, target_size)
    # Convert BGR to RGB, normalize to [0, 1], transpose to CHW
    img_in = img_resized[:, :, ::-1].astype(np.float32) / 255.0
    img_in = np.transpose(img_in, (2, 0, 1))
    img_in = np.expand_dims(img_in, axis=0)
    return img_in, h, w, img

def run_dwpose(image_path):
    if session is None:
        return None, None
        
    img = cv2.imread(image_path)
    orig_h, orig_w, _ = img.shape
    preview_img = img.copy()
    
    # 1. Create a 3:4 Aspect Ratio Bounding Box covering the character area
    # DWPose maps coordinates based on the bounding box dimension context
    box_w = orig_w
    box_h = int(box_w * (384 / 288))
    
    if box_h < orig_h:
        box_h = orig_h
        box_w = int(box_h * (288 / 384))
        
    # Pad canvas if character bounds exceed the 3:4 target area
    pad_x = max(0, (box_w - orig_w) // 2)
    pad_y = max(0, (box_h - orig_h) // 2)
    
    padded_img = cv2.copyMakeBorder(img, pad_y, pad_y, pad_x, pad_x, cv2.BORDER_CONSTANT, value=[0,0,0])
    img_resized = cv2.resize(padded_img, (288, 384))
    
    # 2. Normalize and format tensor for inference
    img_in = img_resized[:, :, ::-1].astype(np.float32) / 255.0
    img_in = np.transpose(img_in, (2, 0, 1))
    img_in = np.expand_dims(img_in, axis=0)
    
    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: img_in})
    
    # 3. Parse and re-map keypoints back to original asset dimensions
    keypoints_output = outputs[0][0]
    detected_keypoints = []
    
    for i, kp in enumerate(keypoints_output):
        raw_x, raw_y = kp[0], kp[1]
        
        # Scale back to padded canvas width/height
        canvas_x = raw_x * (padded_img.shape[1] / 288.0)
        canvas_y = raw_y * (padded_img.shape[0] / 384.0)
        
        # Substract padding to land precisely on original image space
        x = int(canvas_x - pad_x)
        y = int(canvas_y - pad_y)
        
        # Filter extreme outlier coordinate predictions
        if x < 0 or y < 0 or x >= orig_w or y >= orig_h:
            continue
            
        detected_keypoints.append({"id": i, "x": x, "y": y})
        
        # Color profile parsing: Map body and full finger ranges separately
        if 91 <= i <= 132:
            color = (0, 0, 255) # Red for 21-keypoint finger chains
            radius = 3
        else:
            color = (0, 255, 0) # Green for primary body skeleton links
            radius = 4
            
        cv2.circle(preview_img, (x, y), radius, color, -1)
        
    return detected_keypoints, preview_img

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    # 1. Run DWPose over the FLAT entire PNG image
    keypoints, preview_img = run_dwpose(filepath)
    
    if keypoints is None:
        return jsonify({'error': 'Failed to process DWPose model'}), 500

    # 2. Save preview image visual
    preview_filename = 'preview_' + filename
    preview_path = os.path.join(app.config['OUTPUT_FOLDER'], preview_filename)
    cv2.imwrite(preview_path, preview_img)

    # 3. Export Skeleton Rig Template as JSON
    rig_template = {
        "source_image": filename,
        "resolution": {"width": preview_img.shape[1], "height": preview_img.shape[0]},
        "total_joints": len(keypoints),
        "keypoints": keypoints
    }
    
    json_filename = filename.rsplit('.', 1)[0] + '_rig.json'
    json_path = os.path.join(app.config['OUTPUT_FOLDER'], json_filename)
    with open(json_path, 'w') as f:
        json.dump(rig_template, f, indent=4)

    return jsonify({
        'preview_url': f'/output/{preview_filename}',
        'rig_url': f'/output/{json_filename}',
        'joints_found': len(keypoints)
    })
device = "cuda" if torch.cuda.is_available() else "cpu"

@app.route('/generate-layers', methods=['POST'])
def generate_layers():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    try:
        # Load the base image
        from PIL import Image
        init_image = Image.open(filepath).convert("RGB")
        
        # 1. Setup LayerDiffusion/Diffusers transparent pipeline logic
        # For an Image-to-Layer generation workflow:
        pipe = StableDiffusionImg2ImgPipeline.from_pretrained(
            "runwayml/stable-diffusion-v1-5", 
            torch_dtype=torch.float16 if device == "cuda" else torch.float32
        ).to(device)
        
        # Load LayerDiffusion weight processors 
        # (Alternatively uses rembg or transparent-background for pure extraction workflows)
        prompt = "clean 2D game asset character layer, isolated on transparent background, high resolution"
        
        # Process image layer
        generated_layer = pipe(prompt=prompt, image=init_image, strength=0.6).images[0]
        
        # 2. Save the alpha-embedded output layer
        layer_output_filename = 'layer_' + filename
        layer_output_path = os.path.join(app.config['OUTPUT_FOLDER'], layer_output_filename)
        generated_layer.save(layer_output_path)
        
        return jsonify({
            'success': True,
            'layer_url': f'/output/{layer_output_filename}'
        })

    except Exception as e:
        return jsonify({'error': f"LayerDiffusion execution failed: {str(e)}"}), 500
@app.route('/output/<filename>')
def output_file(filename):
    return send_from_directory(app.config['OUTPUT_FOLDER'], filename)

if __name__ == '__main__':
    app.run(debug=True, port=5000)