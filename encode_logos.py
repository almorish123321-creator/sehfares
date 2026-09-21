import os
import base64
import json

folder = r"C:\Users\Zakarya\.gemini\antigravity\scratch\seha-sickleave-app\الشعارات"
encoded = {}

for filename in os.listdir(folder):
    if filename.endswith(".jpg") or filename.endswith(".png") or filename.endswith(".JPG"):
        filepath = os.path.join(folder, filename)
        with open(filepath, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("utf-8")
            ext = filename.split(".")[-1].lower()
            mime = "image/png" if ext == "png" else "image/jpeg"
            encoded[filename] = f"data:{mime};base64,{b64}"

with open("base64_logos.json", "w") as f:
    json.dump(encoded, f, indent=2)

print("Saved base64 logos to base64_logos.json")
