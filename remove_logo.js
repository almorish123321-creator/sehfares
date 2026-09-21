const fs = require('fs');
let html = fs.readFileSync('pdf-template.html', 'utf8');

// 1. Remove the img tag
html = html.replace('<img src="./%D8%A7%D9%84%D8%B4%D8%B9%D8%A7%D8%B1%D8%A7%D8%AA/ksa_calligraphy.png" alt="Calligraphy" style="height: 55px; object-fit: contain;">\r\n', '');
html = html.replace('<img src="./%D8%A7%D9%84%D8%B4%D8%B9%D8%A7%D8%B1%D8%A7%D8%AA/ksa_calligraphy.png" alt="Calligraphy" style="height: 55px; object-fit: contain;">\n', '');
html = html.replace('<img src="./%D8%A7%D9%84%D8%B4%D8%B9%D8%A7%D8%B1%D8%A7%D8%AA/ksa_calligraphy.png" alt="Calligraphy" style="height: 55px; object-fit: contain;">', '');

// 2. Adjust header height to remove the empty space
html = html.replace('width: 100%; height: 90px; margin-bottom: 25px;', 'width: 100%; margin-bottom: 10px;');

fs.writeFileSync('pdf-template.html', html, 'utf8');
console.log('Removed calligraphy logo and adjusted spacing');
