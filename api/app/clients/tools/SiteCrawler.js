const { Tool } = require('langchain/tools');
const puppeteer = require('puppeteer');

class SiteCrawler extends Tool {
  constructor() {
    super();
    this.name = 'sitecrawler';
    this.description = 'crawl content from a specific website to get informations';
  }

  shortenText(text, maxLength) {
    const words = text.split(' ');
    const shortenedWords = words.map((word) =>
      word.length > maxLength ? this.removeRandomLetter(word) : word,
    );
    return shortenedWords.join(' ');
  }

  removeRandomLetter(word) {
    if (!this.isURL(word)) {
      const indexToRemove = Math.floor(Math.random() * (word.length - 1)) + 1;
      return word.slice(0, indexToRemove) + word.slice(indexToRemove + 1);
    } else {
      return word;
    }
  }

  isURL(word) {
    try {
      new URL(word);
      return true;
    } catch (error) {
      return false;
    }
  }

  removeHtmlTags(text) {
    // Regex um HTML-Tags zu finden
    const regex = /<.+?>/g;

    // Alle HTML-Tags mit einem leeren String ersetzen
    let cleanedText = text.replace(regex, '');

    // Alle Links extrahieren
    const linkRegex = /<a.+?href="(.+?)"[^>]+>/g;
    let matches;

    while ((matches = linkRegex.exec(text)) !== null) {
      // Link-Text mit URL ersetzen
      cleanedText = cleanedText.replace(matches[0], matches[1]);
    }

    return cleanedText;
  }

  async _call(input) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(input, { waitUntil: 'networkidle2' });

    // wait to load the page complete
    await new Promise((r) => setTimeout(r, 1000));

    // remove cookie banner if exists
    await page.evaluate(() => {
      const divsWithCookieText = Array.from(document.querySelectorAll('div')).filter(
        (div) =>
          div.textContent.includes('Cookie') &&
          (div.querySelector('a') || div.querySelector('button')),
      );

      divsWithCookieText.forEach((div) => (div.style.display = 'none'));
    });

    // get body innerText
    const content = await page.evaluate(() => {
      return document.body.innerText;
    });
    await browser.close();

    // remove html tags and extract links
    const cleanedContent = this.removeHtmlTags(content);

    // short long words for token optimization
    const shortenContent = this.shortenText(cleanedContent, 7);

    return shortenContent;
  }
}

module.exports = SiteCrawler;
