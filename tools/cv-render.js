// Genera los PDF del CV desde cv/source/*.html con Playwright (Chromium).
// Uso: node tools/cv-render.js   (necesita la fuente Inter instalada en el sistema)
const path = require('path');
const { chromium } = require('playwright');
const jobs = [['cv-es.html', 'CV_Ignacio_Sanchez_ES.pdf'], ['cv-en.html', 'CV_Ignacio_Sanchez_EN.pdf']];
(async () => {
  const browser = await chromium.launch();
  for (const [src, out] of jobs) {
    const page = await browser.newPage();
    await page.goto('file://' + path.resolve(__dirname, '../cv/source', src));
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: path.resolve(__dirname, '../cv', out), format: 'A4', printBackground: true, preferCSSPageSize: true });
    await page.close();
  }
  await browser.close();
})();
