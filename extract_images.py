import fitz
import base64
import json
import os

pdf_path = r"C:\Users\Zakarya\.gemini\antigravity\scratch\seha-sickleave-app\سكاليف سابقة\sickLeaves.pdf"
doc = fitz.open(pdf_path)

images_data = []

for page_index in range(len(doc)):
    page = doc[page_index]
    image_list = page.get_images()
    
    for img_index, img in enumerate(image_list):
        xref = img[0]
        base_image = doc.extract_image(xref)
        image_bytes = base_image["image"]
        image_ext = base_image["ext"]
        images_data.append({
            "index": img_index,
            "ext": image_ext,
            "size": len(image_bytes),
            "base64": base64.b64encode(image_bytes).decode('utf-8')
        })
        
        # Also save to disk just in case
        with open(f"extracted_img_{img_index}.{image_ext}", "wb") as f:
            f.write(image_bytes)

with open("images_meta.json", "w") as f:
    json.dump([{"index": i["index"], "ext": i["ext"], "size": i["size"]} for i in images_data], f, indent=2)

print("Images extracted successfully!")
