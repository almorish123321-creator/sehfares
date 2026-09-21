import urllib.request
import urllib.parse
import base64

try:
    nhic_url = "https://upload.wikimedia.org/wikipedia/commons/9/90/" + urllib.parse.quote("المركز_الوطني_للمعلومات_الصحية.png")
    req = urllib.request.Request(nhic_url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response:
        img_data = response.read()
        b64 = base64.b64encode(img_data).decode('utf-8')
        with open("nhic_base64.txt", "w") as f:
            f.write(f"data:image/png;base64,{b64}")
    print("NHIC success")
except Exception as e:
    print("NHIC failed:", e)

try:
    ksa_url = "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Emblem_of_Saudi_Arabia.svg/300px-Emblem_of_Saudi_Arabia.svg.png"
    req = urllib.request.Request(ksa_url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response:
        img_data = response.read()
        b64 = base64.b64encode(img_data).decode('utf-8')
        with open("ksa_base64.txt", "w") as f:
            f.write(f"data:image/png;base64,{b64}")
    print("KSA success")
except Exception as e:
    print("KSA failed:", e)
