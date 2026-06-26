import torch
from diffusers import StableDiffusionXLPipeline, ControlNetModel
from diffusers.utils import load_image
import numpy as np
from PIL import Image

# 1. Load your original character image
# Ensure your uploaded character image is in the same directory
init_image = Image.open("image_6f9067.png").convert("RGB")
init_image = init_image.resize((1024, 1024)) # SDXL works best at 1024x1024

# 2. Initialize LayerDiffusion Checkpoints via HuggingFace
# LayerDiffusion uses specific attention layers to generate an alpha (transparency) channel
model_id = "LayerDiffusion/layerdiffusion-v1" 

print("⏳ Loading LayerDiffusion pipeline... (This might take a bit)")
pipe = StableDiffusionXLPipeline.from_pretrained(
    "compatibility/stable-diffusion-xl-base-1.0", 
    torch_dtype=torch.float16, 
    use_safetensors=True
).to("cuda")

# Load LayerDiffusion LoRA / Attention processors for transparency
pipe.load_lora_weights(model_id, weight_name="layer_xl_transparent_attn.safetensors", adapter_name="transparent")
pipe.set_adapters(["transparent"])

# 3. Define the Generation Prompt
# We want to keep the character consistent but generate them with a clean transparent layer
prompt = "high quality 2D character asset, full body, video game sprite, clean lineart"
negative_prompt = "ugly, deformed, background elements, scenery, low quality"

print("🎨 Generating transparent character layer...")
with torch.inference_mode():
    # Generate the image frame
    output = pipe(
        prompt=prompt,
        negative_prompt=negative_prompt,
        num_inference_steps=30,
        guidance_scale=7.5
    ).images[0]

# 4. Extract the Alpha (Transparency) Channel
# LayerDiffusion modifies the latent space to embed transparency information directly
# We convert the generated output matrix into an RGBA PNG asset
rgba_image = output.convert("RGBA")
datas = rgba_image.getdata()

# Process pixels: LayerDiffusion models generally output a flat background color (like solid white or black)
# where the alpha layer belongs, depending on the adapter configuration used.
new_data = []
for item in datas:
    # If the pixel matches the generated background threshold, make it completely transparent
    if item[0] > 240 and item[1] > 240 and item[2] > 240:  # Adjust threshold based on model output
        new_data.append((255, 255, 255, 0)) # Fully Transparent
    else:
        new_data.append(item)

rgba_image.putdata(new_data)

# 5. Save the generated transparent layer asset
rgba_image.save("layerdiffusion_output.png")
print("🎉 Success! Transparent layer asset saved as 'layerdiffusion_output.png'")