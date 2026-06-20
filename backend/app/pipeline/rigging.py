"""Builds a bone hierarchy (bones.json) from the keypoints produced by
segmentation.py. Hierarchy:

    root (pelvis)
      └─ spine -> neck
            ├─ head
            ├─ shoulder_left -> elbow_left -> wrist_left   (arm_left)
            ├─ shoulder_right -> elbow_right -> wrist_right (arm_right)
      ├─ hip_left -> knee_left -> ankle_left   (leg_left)
      └─ hip_right -> knee_right -> ankle_right (leg_right)
"""
from __future__ import annotations


def _pt(x, y):
    return {"x": float(x), "y": float(y)}


def build_bones(keypoints: dict) -> list[dict]:
    kp = keypoints
    neck = [(kp["left_shoulder"][0] + kp["right_shoulder"][0]) / 2,
            (kp["left_shoulder"][1] + kp["right_shoulder"][1]) / 2]
    pelvis = [(kp["left_hip"][0] + kp["right_hip"][0]) / 2,
              (kp["left_hip"][1] + kp["right_hip"][1]) / 2]
    head_top = [kp["nose"][0] - (neck[0] - kp["nose"][0]) * 1.4,
                kp["nose"][1] - (neck[1] - kp["nose"][1]) * 1.4]

    bones = [
        {"id": "root", "name": "Root", "parent": None, "start": _pt(*pelvis), "end": _pt(*pelvis), "part": "torso"},
        {"id": "spine", "name": "Spine", "parent": "root", "start": _pt(*pelvis), "end": _pt(*neck), "part": "torso"},
        {"id": "head", "name": "Head", "parent": "spine", "start": _pt(*neck), "end": _pt(*head_top), "part": "head"},

        {"id": "shoulder_l", "name": "Shoulder.L", "parent": "spine", "start": _pt(*neck),
         "end": _pt(*kp["left_shoulder"]), "part": "arm_left"},
        {"id": "upperarm_l", "name": "UpperArm.L", "parent": "shoulder_l", "start": _pt(*kp["left_shoulder"]),
         "end": _pt(*kp["left_elbow"]), "part": "arm_left"},
        {"id": "forearm_l", "name": "Forearm.L", "parent": "upperarm_l", "start": _pt(*kp["left_elbow"]),
         "end": _pt(*kp["left_wrist"]), "part": "arm_left"},

        {"id": "shoulder_r", "name": "Shoulder.R", "parent": "spine", "start": _pt(*neck),
         "end": _pt(*kp["right_shoulder"]), "part": "arm_right"},
        {"id": "upperarm_r", "name": "UpperArm.R", "parent": "shoulder_r", "start": _pt(*kp["right_shoulder"]),
         "end": _pt(*kp["right_elbow"]), "part": "arm_right"},
        {"id": "forearm_r", "name": "Forearm.R", "parent": "upperarm_r", "start": _pt(*kp["right_elbow"]),
         "end": _pt(*kp["right_wrist"]), "part": "arm_right"},

        {"id": "hip_l", "name": "Hip.L", "parent": "root", "start": _pt(*pelvis), "end": _pt(*kp["left_hip"]),
         "part": "leg_left"},
        {"id": "thigh_l", "name": "Thigh.L", "parent": "hip_l", "start": _pt(*kp["left_hip"]),
         "end": _pt(*kp["left_knee"]), "part": "leg_left"},
        {"id": "shin_l", "name": "Shin.L", "parent": "thigh_l", "start": _pt(*kp["left_knee"]),
         "end": _pt(*kp["left_ankle"]), "part": "leg_left"},

        {"id": "hip_r", "name": "Hip.R", "parent": "root", "start": _pt(*pelvis), "end": _pt(*kp["right_hip"]),
         "part": "leg_right"},
        {"id": "thigh_r", "name": "Thigh.R", "parent": "hip_r", "start": _pt(*kp["right_hip"]),
         "end": _pt(*kp["right_knee"]), "part": "leg_right"},
        {"id": "shin_r", "name": "Shin.R", "parent": "thigh_r", "start": _pt(*kp["right_knee"]),
         "end": _pt(*kp["right_ankle"]), "part": "leg_right"},
    ]
    return bones
