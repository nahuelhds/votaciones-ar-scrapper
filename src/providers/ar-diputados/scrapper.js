import puppeteer from "puppeteer";
import logger, { pageConsoleLogger } from "services/logger";
import {
  DOWNLOAD_PATH,
  getFilesFromFolder,
  dirExistsSync,
  createDirRecursively,
  persistData
} from "services/fs";

const __DEV__ = process.env.NODE_ENV !== "production";
const VOTINGS_URI = "https://votaciones.hcdn.gob.ar";

let puppeteerConfig = {};
if (__DEV__) {
  puppeteerConfig = {
    headless: !__DEV__,
    devtools: !__DEV__,
    slowMo: 100 // slow down by 250ms,
  };
}
const pageViewport = {
  width: 1200,
  height: 900
};

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
      logger.info(`Abriendo nueva pestaña`);
      const page = await this.browser.newPage();
      if (__DEV__) {
        page.setViewport(pageViewport);
      }
      page.on("console", pageConsoleLogger);
      return page;
    } catch (error) {
      throw `Ocurrió un error al crear una página. Error: ${error}`;
    }
  };

  /**
   * Analiza las votaciones del año dado
   */
  parseVotingsFromYear = async year => {
    logger.info(`Abriendo pestaña`);
    const page = await this.createPage();
    logger.info(`Ingresando al sitio ${VOTINGS_URI}`);
    await page.goto(VOTINGS_URI, { waitUntil: "networkidle2" });
    try {
      logger.info(`Ingresando al año ${year}`);
      await this.gotoYear(page, year);
    } catch (err) {
      throw err;
    }

    logger.info(`Analizando votaciones...`);

    // Votaciones - Información general
    // 1. - Muestro todas las filas
    const rowsSelector =
      ".table-responsive tbody#container-actas > tr.row-acta";
    const votings = await page.$$eval(rowsSelector, rows => {
      return rows.map(row => {
        // Show rows for clicking
        row.removeAttribute("style");

        // Date. Format: new Date(numero * 1000)
        const detailsUrl = row
          .querySelector("td > center > button:nth-child(2)")
          .getAttribute("urldetalle");

        const id = parseInt(detailsUrl.replace("/votacion/", ""));
        const date = new Date(parseInt(row.getAttribute("data-date")) * 1000)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
        const title = row
          .querySelector("td:nth-child(2)")
          .textContent.replace("(Ver expedientes)", "")
          .replace(/\n/g, " ")
          .replace(/\t/g, " ")
          .trim();
        const type = row.querySelector("td:nth-child(3)").textContent.trim();
        const result = row.querySelector("td:nth-child(4)").textContent.trim();

        // PDF
        // onclick="updatePdf('https://votaciones.hcdn.gob.ar/proxy/pdf/1993/111PO06_31_R31.pdf','111','6','31')"
        const recordUrl = row
          .querySelector("td > center > button:nth-child(1)")
          .getAttribute("onclick")
          .replace(/.*'(https:\/\/votaciones.*?)'.*/g, "$1");

        // Video
        // onclick="openVideo('1IIlS4l-xOg', '', '')"
        const videoUrlAttribute = row
          .querySelector("td > center > button:nth-child(3)")
          .getAttribute("onclick");
        let videoUrl = null;
        if (videoUrlAttribute != null) {
          const videoUrlId = videoUrlAttribute.replace(
            /openVideo\('(.*?)'.*\)/g,
            "$1"
          );

          videoUrl = `https://www.youtube.com/watch?v=${videoUrlId}`;
        }

        const voting = {
          id,
          date,
          title,
          type,
          result,
          recordUrl,
          detailsUrl,
          videoUrl
        };

        return voting;
      });
    });
    logger.info(
      `Análisis de votaciones finalizada. Cantidad: ${votings.length}`
    );

    try {
      await persistData("diputados", `${year}.json`, votings);
      logger.info(`Votaciones guardadas.`);
    } catch (error) {
      logger.info(
        `No se pudo guardar el archivo de votaciones. Error: ${error.stack}`
      );
    }

    logger.info(`Analizando expedientes...`);

    try {
      await this.clickAllFilesLink(page, rowsSelector);
    } catch (error) {
      logger.error(
        `No se pudieron abrir los expedientes del año requerido. Error: ${
          error.stack
        }`
      );
    }

    const recordsFromYear = [];
    for (const index in votings) {
      let voting = votings[index];
      const nth = parseInt(index) + 1;
      const recordsSelector = `${rowsSelector}:nth-child(${nth}) > td:nth-child(2) div[tituloexpediente]`;
      // Si el elemento no existe es porque el click masivo no se realizó ok, por lo que
      // es necesario realizarlo nuevamente de forma particular (y esperar el feedback)
      try {
        const recordsElement = await page.$(recordsSelector);
        if (!recordsElement) {
          logger.info(`No se cargaron los expedientes para #${voting.id}`);
          const linkSelector = `${rowsSelector}:nth-child(${nth}) > td:nth-child(2) a[id]`;
          const linkElement = await page.$(linkSelector);
          if (linkElement) {
            logger.info(`No hay nada que clickear`);
          } else {
            // Reintento con todos los expedientes de nuevo
            await this.clickAllFilesLink(page, rowsSelector);
          }
        }
      } catch (error) {
        logger.error(
          `No se pudo abrir el expediente de la fila ${nth} para la votación ${
            voting.id
          }`
        );
      }
      try {
        const records = await page.$$eval(recordsSelector, records =>
          records.map(record => {
            const id = record.getAttribute("identificador").trim();
            const title = record
              .getAttribute("tituloexpediente")
              .replace(/\n/g, " ")
              .replace(/\t/g, " ")
              .trim();
            return {
              id,
              title
            };
          })
        );
        voting.records = records;
        if (records.length) {
          logger.info(
            `Expedientes encontrados para la votación #${voting.id}: ${
              records.length
            }`
          );

          records.map(record => {
            record.votingId = voting.id;
            recordsFromYear.push(record);
          });
        } else {
          logger.info(`La votación ${voting.id} no tiene expedientes`);
        }
      } catch (error) {
        logger.error(
          `No se pudieron leer los expedientes de la votación #${
            voting.id
          }. Error: ${error.stack}`
        );
      }
    }

    try {
      await persistData(
        "diputados/expedientes",
        `${year}-records.json`,
        recordsFromYear
      );
      logger.info(`Expedientes guardados.`);
    } catch (error) {
      logger.info(
        `No se pudo guardar el archivo de expedientes. Error: ${error.stack}`
      );
    }
    logger.info(`Análisis de registros finalizado`);

    await page.close();
    return votings;
  };

  clickAllFilesLink = async (page, rowsSelector) => {
    const linkSelector = `${rowsSelector} > td:nth-child(2) a[id]`;
    await page.$$eval(linkSelector, async links => {
      /* eslint-disable no-console */
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
      for (const link of links) {
        if (link.textContent.indexOf("Ver") > -1) {
          await sleep(500); // minimo 500ms
          link.click();
        }
      }
      /* eslint-enable no-console */
    });
  };

  /**
   * Analiza y descarga los votos de les legisladores
   * para la votación dada
   */
  parseVotingsDetails = async (page, voting, downloadRelativePath) => {
    try {
      const pageUrl = `${VOTINGS_URI}${voting.url}`;
      logger.info(`\nINICIO VOTACION #${voting.id}`);
      logger.info(pageUrl);

      await page.goto(pageUrl, {
        waitUntil: "networkidle2"
      });

      logger.info(`\nObteniendo datos...`);
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

      logger.info(periodMeetingRecordText);

      const presidentElement = await page.$(`.white-box #custom-share h4 > b`);
      const presidentProp = await presidentElement.getProperty("textContent");
      voting.president = await presidentProp.jsonValue();
      logger.info(`Presidente\t\t ${voting.president}`);

      try {
        const documentUrl = await page.$(`.white-box div:nth-child(3) h5 a`);
        const documentUrlProp = await documentUrl.getProperty("href");
        voting.documentUrl = await documentUrlProp.jsonValue();
        logger.info(`URL del documento\t ${voting.documentUrl}`);
      } catch (err) {
        logger.info("No se pudo obtener la URL del documento");
      }

      const affirmativeCount = await page.$(
        `.white-box div:nth-child(3) > div.row > div:nth-child(1) > ul > h3`
      );
      const affirmativeCountProp = await affirmativeCount.getProperty(
        "textContent"
      );
      voting.affirmativeCount = await affirmativeCountProp.jsonValue();
      logger.info(`Votos afirmativos\t${voting.affirmativeCount}`);

      const negativeCount = await page.$(
        `.white-box div:nth-child(3) > div.row > div:nth-child(2) > ul > h3`
      );
      const negativeCountProp = await negativeCount.getProperty("textContent");
      voting.negativeCount = await negativeCountProp.jsonValue();
      logger.info(`Votos negativos\t\t${voting.negativeCount}`);

      const abstentionCount = await page.$(
        `.white-box div:nth-child(3) > div.row > div:nth-child(3) > ul > h3`
      );
      const abstentionCountProp = await abstentionCount.getProperty(
        "textContent"
      );
      voting.abstentionCount = await abstentionCountProp.jsonValue();
      logger.info(`Abstenciones\t\t${voting.abstentionCount}`);

      const absentCount = await page.$(
        `.white-box div:nth-child(3) > div.row > div:nth-child(4) > ul > h3`
      );
      const absentCountProp = await absentCount.getProperty("textContent");
      voting.absentCount = await absentCountProp.jsonValue();
      logger.info(`Ausentes\t\t${voting.absentCount}`);

      await this.downloadVotesCsvFromPage(
        page,
        `${downloadRelativePath}/${voting.id}`
      );
    } catch (err) {
      logger.info(err);
    } finally {
      logger.info(`FIN VOTACION #${voting.id}\n`);
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

      logger.info(`Descargando archivo de votos...`);

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
      logger.info(`Archivo de votos descargado con éxito`);
    } catch (error) {
      logger.info(error);
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
