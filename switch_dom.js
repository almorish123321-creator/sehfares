const fs = require('fs');
let appJs = fs.readFileSync('app.js', 'utf8');

const targetStr = `            const opt = {
                margin: 0,
                filename: 'sickLeaves.pdf',
                image: { type: 'jpeg', quality: 1 },
                html2canvas: { 
                    scale: 2, 
                    useCORS: true, 
                    windowWidth: 794, 
                    width: 794, 
                    windowHeight: 1122, 
                    height: 1122, 
                    scrollY: 0, 
                    scrollX: 0,
                    x: 0,
                    y: 0,
                    allowTaint: true,
                    letterRendering: false
                },
                jsPDF: { unit: 'px', format: [794, 1122], orientation: 'portrait', hotfixes: ["px_scaling"] }
            };

            const pdfBase64 = await html2pdf().from(pdfElement).set(opt).outputPdf('datauristring');`;

const replacementStr = `
            // Generate PNG using dom-to-image to preserve exact browser Arabic text rendering (RTL/CTL)
            // html2canvas is known to mangle Arabic cursive joining.
            const scale = 2; // high quality
            const dataUrl = await domtoimage.toJpeg(pdfElement, {
                quality: 0.98,
                bgcolor: '#ffffff',
                width: 794 * scale,
                height: 1122 * scale,
                style: {
                    transform: 'scale(' + scale + ')',
                    transformOrigin: 'top left',
                    width: '794px',
                    height: '1122px'
                }
            });

            // Create jsPDF and inject the perfectly rendered image
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ unit: 'px', format: [794, 1122], orientation: 'portrait', hotfixes: ["px_scaling"] });
            pdf.addImage(dataUrl, 'JPEG', 0, 0, 794, 1122);
            const pdfBase64 = pdf.output('datauristring');
`;

if (appJs.includes(targetStr)) {
    appJs = appJs.replace(targetStr, replacementStr);
    fs.writeFileSync('app.js', appJs, 'utf8');
    console.log('app.js updated successfully to use dom-to-image!');
} else {
    console.log('Target string not found in app.js!');
}
