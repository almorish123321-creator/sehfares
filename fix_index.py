import sys

with open("index.html", "r", encoding="utf-8") as f:
    content = f.read()
    
# Remove the old #pdf-wrapper block
start_idx = content.find('<!-- Hidden PDF Template -->')
if start_idx != -1:
    content = content[:start_idx] + '</body>\n</html>'

with open("index.html", "w", encoding="utf-8") as f:
    f.write(content)
    
print("Fixed index.html properly with UTF-8")
