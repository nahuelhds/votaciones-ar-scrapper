import puppeteer from "puppeteer";

import {
  DOWNLOAD_PATH,
  dirExistsSync,
  createDirRecursively,
  getFilesFromFolder
} from "./fs";

const __DEV__ = process.env.NODE_ENV === "development";
const VOTINGS_URI = "https://votaciones.hcdn.gob.ar";

const PAGE_LOG = false;

let puppeteerConfig = {};
if (__DEV__) {
  puppeteerConfig = {
    headless: !__DEV__,
    devtools: __DEV__,
    slowMo: 100 // slow down by 250ms,
  };
}

export default class Scrapper {
  browser;

  /**
   * Inicia el navegador
   */
  start = async () => {
    try {
      this.browser = await puppeteer.launch(puppeteerConfig);
    } catch (error) {
      throw `Ocurrió un error al configurar puppeteer. Error: ${error}`;
    }
  };

  /**
   * Finaliza el navegador
   */
  finish = async () => {
    await this.browser.close();
  };

  /**
   * Crea una nueva pestaña
   */
  createPage = async () => {
    try {
      console.info(`Abriendo nueva pestaña`);
      const page = await this.browser.newPage();
      if (__DEV__ && PAGE_LOG) {
        page.on("console", msg => {
          const text = msg.text();
          if (text.indexOf("Failed to load resource") > -1) {
            return;
          }
          console.log("PAGE LOG:", text);
        });
      }
      return page;
    } catch (error) {
      throw `Ocurrió un error al crear una página. Error: ${error}`;
    }
  };

  /**
   * Analiza las votaciones del año dado
   */
  parseVotingsFromYear = async year => {
    console.info(`Abriendo pestaña`);
    const page = await this.createPage();
    console.info(`Ingresando al sitio`, VOTINGS_URI);
    await page.goto(VOTINGS_URI, { waitUntil: "networkidle2" });
    try {
      console.info(`Ingresando al año`, year);
      await this.gotoYear(page, year);
    } catch (err) {
      throw err;
    }

    console.info(`Analizando votaciones...`);

    // Votaciones - Información general
    // 1. - Muestro todas las filas
    const rowsSelector =
      ".table-responsive tbody#container-actas > tr.row-acta";
    const votings = await page.$$eval(rowsSelector, rows => {
      return rows.map(row => {
        // Show rows for clicking
        row.removeAttribute("style");

        // Date. Format: new Date(numero * 1000)
        const url = row
          .querySelector("td > center > button:nth-child(2)")
          .getAttribute("urldetalle");

        const id = url.replace("/votacion/", "");
        const date = row.getAttribute("data-date");
        const title = row
          .querySelector("td:nth-child(2)")
          .textContent.replace("(Ver expedientes)", "")
          .trim();
        const type = row.querySelector("td:nth-child(3)").textContent.trim();
        const result = row.querySelector("td:nth-child(4)").textContent.trim();

        const voting = {
          id,
          date,
          title,
          type,
          result,
          url
        };

        return voting;
      });
    });
    console.info(
      `Análisis de votaciones finalizada. Cantidad:`,
      votings.length
    );

    console.info(`Analizando registros...`);

    for (const index in votings) {
      let voting = votings[index];
      const nth = parseInt(index) + 1;
      const linkSelector = `${rowsSelector}:nth-child(${nth}) > td:nth-child(2) a[id]`;
      const recordsSelector = `${rowsSelector}:nth-child(${nth}) > td:nth-child(2) div[tituloexpediente]`;
      try {
        const link = await page.$(linkSelector);
        const linkTextProp = await link.getProperty("textContent");
        const linkText = await linkTextProp.jsonValue();
        if (linkText.indexOf("Ver") > -1) {
          await link.click();
          await page.waitForSelector(recordsSelector);
        }
        const records = await page.$$eval(recordsSelector, records =>
          records.map(record => {
            const id = record.getAttribute("identificador");
            const title = record.getAttribute("tituloexpediente");
            return {
              id,
              title
            };
          })
        );
        voting.records = records;
        console.warn(
          `Registros de la votación #${voting.id}. Cantidad:`,
          records.length
        );
      } catch (error) {
        console.warn(`Votación #${voting.id} no tiene registros`);
        voting.records = [];
      }
    }
    console.info(`Análisis de registros finalizado`);

    await page.close();
    return votings;
  };

  /**
   * Analiza y descarga los votos de les legisladores
   * para la votación dada
   */
  parseVotingsDetails = async (page, voting, downloadRelativePath) => {
    try {
      const pageUrl = `${VOTINGS_URI}${voting.url}`;
      console.info(`\nINICIO VOTACION #${voting.id}`);
      console.info(pageUrl);

      await page.goto(pageUrl, {
        waitUntil: "networkidle2"
      });

      console.info(`\nObteniendo datos...`);
      const periodMeetingRecord = await page.$(
        `.container-fluid > div:first-child > div.row:first-child h5`
      );
      const periodMeetingRecordProp = await periodMeetingRecord.getProperty(
        "textContent"
      );
      const periodMeetingRecordValue = await periodMeetingRecordProp.jsonValue();
      const periodMeetingRecordText = periodMeetingRecordValue.trim();
      const periodMeetingRecordArray = periodMeetingRecordText.split(" - ");
      voting.period = parseInt(periodMeetingRecordArray[0].split(" ")[1]);
      voting.meeting = parseInt(periodMeetingRecordArray[1].split(" ")[1]);
      voting.record = parseInt(periodMeetingRecordArray[2].split(" ")[1]);

      console.info(periodMeetingRecordText);

      const presidentElement = await page.$(`.white-box #custom-share h4 > b`);
      const presidentProp = await presidentElement.getProperty("textContent");
      voting.president = await presidentProp.jsonValue();
      console.info("Presidente\t\t", voting.president);

      try {
        const documentUrl = await page.$(`.white-box div:nth-child(3) h5 a`);
        const documentUrlProp = await documentUrl.getProperty("href");
        voting.documentUrl = await documentUrlProp.jsonValue();
        console.info("URL del documento\t", voting.documentUrl);
      } catch (err) {
        console.info("No se pudo obtener la URL del documento");
      }

      const affirmativeCount = await page.$(
        `.white-box div:nth-child(3) > div.row > div:nth-child(1) > ul > h3`
      );
      const affirmativeCountProp = await affirmativeCount.getProperty(
        "textContent"
      );
      voting.affirmativeCount = await affirmativeCountProp.jsonValue();
      console.info("Votos afirmativos\t", voting.affirmativeCount);

      const negativeCount = await page.$(
        `.white-box div:nth-child(3) > div.row > div:nth-child(2) > ul > h3`
      );
      const negativeCountProp = await negativeCount.getProperty("textContent");
      voting.negativeCount = await negativeCountProp.jsonValue();
      console.info("Votos negativos\t\t", voting.negativeCount);

      const abstentionCount = await page.$(
        `.white-box div:nth-child(3) > div.row > div:nth-child(3) > ul > h3`
      );
      const abstentionCountProp = await abstentionCount.getProperty(
        "textContent"
      );
      voting.abstentionCount = await abstentionCountProp.jsonValue();
      console.info("Abstenciones\t\t", voting.abstentionCount);

      const absentCount = await page.$(
        `.white-box div:nth-child(3) > div.row > div:nth-child(4) > ul > h3`
      );
      const absentCountProp = await absentCount.getProperty("textContent");
      voting.absentCount = await absentCountProp.jsonValue();
      console.info("Ausentes\t\t", voting.absentCount);

      await this.downloadVotesCsvFromPage(page, downloadRelativePath);
    } catch (err) {
      console.info(err);
    } finally {
      console.info(`FIN VOTACION #${voting.id}\n`);
    }

    return voting;
  };

  /**
   * Descarga el CSV con los votos
   */
  downloadVotesCsvFromPage = async (page, downloadRelativePath) => {
    const downloadPath = `${DOWNLOAD_PATH}/${downloadRelativePath}`;
    try {
      const files = getFilesFromFolder(downloadPath);
      if (dirExistsSync(downloadPath) && files.length > 0) {
        throw `El archivo de votos ya existe`;
      }
      createDirRecursively(downloadPath);

      console.info(`Descargando archivo de votos...`);

      await page._client.send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath
      });

      const csvSelector = `a[title="Descargar datos en CSV"]`;
      await page.waitForSelector(csvSelector);
      const csvButton = await page.$(csvSelector);
      await page.evaluate(el => {
        return el.click();
      }, csvButton);
      console.info(`Archivo de votos descargado con éxito`);
    } catch (error) {
      console.info(error);
    }

    return downloadPath;
  };

  /**
   * Ingresa a la pantalla de las votaciones del año dado
   */
  gotoYear = async (page, year) => {
    // TODO: "-1" => Todos los años
    const yearSelect = await page.$("select#select-ano");

    const selectedYearOption = await page.$(
      `select#select-ano > option[value="${year}"]`
    );

    if (!selectedYearOption) {
      throw `The specified year ${year} doesn't exists as an option`;
    }

    // use manually trigger change event
    await page.evaluate(
      (optionElem, selectElem) => {
        optionElem.selected = true;
        const event = new Event("change", { bubbles: true });
        selectElem.dispatchEvent(event);
      },
      selectedYearOption,
      yearSelect
    );

    return await page.waitForNavigation({ waitUntil: "networkidle2" });
  };
}
