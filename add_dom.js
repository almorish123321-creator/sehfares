const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
if(!html.includes('dom-to-image')) {
    html = html.replace('</head>', '    <script src="https://cdnjs.cloudflare.com/ajax/libs/dom-to-image/2.6.0/dom-to-image.min.js"></script>\n</head>');
    fs.writeFileSync('index.html', html, 'utf8');
    console.log('Added dom-to-image');
}
