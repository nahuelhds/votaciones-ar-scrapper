import puppeteer from "puppeteer";
import logger, { pageConsoleLogger } from "services/logger";
import {
  DOWNLOAD_PATH,
  getFilesFromFolder,
  dirExistsSync,
  createDirRecursively
} from "services/fs";

const __DEV__ = process.env.NODE_ENV !== "production";
const VOTINGS_URI = "https://www.senado.gov.ar/votaciones/actas";

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
      logger.info(`Abriendo nueva pestaña`);
      const page = await this.browser.newPage();
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
      const resultsPerPage = 100;
      logger.info(`Resultados por página: ${resultsPerPage}`);
      await this.setMaxPagination(page, resultsPerPage);
    } catch (err) {
      throw err;
    }

    logger.info(`Analizando votaciones...`);

    // Votaciones - Información general
    const rowsSelector = "#actasTable > tbody > tr";
    const votings = [];
    let hasNextPage = true;
    let currentPage = 0;
    while (hasNextPage) {
      currentPage++;
      try {
        // Voting data
        const votingsData = await page.$$eval(
          rowsSelector,
          this.parsePageVotingsRows
        );
        votingsData.map(voting => votings.push(voting));

        // Next page
        const nextButtonElement = await page.$("#actasTable_next");
        hasNextPage = await this.hasNextPaginationPage(nextButtonElement);
        if (hasNextPage) {
          await page.click("#actasTable_next");
        }
      } catch (error) {
        logger.error(`Error on page ${currentPage}: ${error.message}`);
      }
    }

    logger.info(`Análisis finalizado. Cantidad: ${votings.length}`);

    await page.close();
    return votings;
  };

  /**
   * Ingresa a la pantalla de las votaciones del año dado
   */
  gotoYear = async (page, year) => {
    // TODO: "-1" => Todos los años
    const yearSelect = await page.$("select#busqueda_actas_anio");

    const selectedYearOption = await page.$(
      `select#busqueda_actas_anio > option[value="${year}"]`
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

    return await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2" }),
      page.click('input[title="Realizar Búsqueda"]')
    ]);
  };

  setMaxPagination = async (page, quantity) => {
    const paginationSelect = await page.$("select[name=actasTable_length]");

    const paginationOption = await page.$(
      `select[name=actasTable_length] > option[value="${quantity}"]`
    );

    if (!paginationOption) {
      throw `The specified quantity ${quantity} doesn't exists as an option`;
    }

    // use manually trigger change event
    await page.evaluate(
      (optionElem, selectElem) => {
        optionElem.selected = true;
        const event = new Event("change", { bubbles: true });
        selectElem.dispatchEvent(event);
      },
      paginationOption,
      paginationSelect
    );
  };

  parsePageVotingsRows = rows =>
    rows.map(row => {
      try {
        // Columnas:
        // 1. Fecha de sesion (YYYYMMDD)
        const date = row
          .querySelector("td:nth-child(1) > span")
          .textContent.trim();

        console.log(date); // eslint-disable-line

        // 2. Nro. Acta
        const record = parseInt(
          row.querySelector("td:nth-child(2)").textContent.trim()
        );
        console.log(record); // eslint-disable-line

        // 3.  Titulo y Expediente
        const fileTitleLink = row.querySelector("td:nth-child(3)");
        // 3.1 Titulo
        // Deja el titulo como: "O.D. 1/2019, Art. 4, Art. 5, Art. 6, Art. 7, Art. 8, Art. 9"
        const title = fileTitleLink.textContent
          .replace("Ocultar Expedientes", "")
          .replace("Ver Expedientes", "")
          .replace(/[\r\n\t]/g, "")
          .split(",")
          .map(text => text.replace(/\s+/g, " ").trim())
          .join(", ");
        console.log(title); // eslint-disable-line

        // 3.2 Expediente
        const fileUrlElement = fileTitleLink.querySelector("div > a[href]");
        const fileUrl = fileUrlElement
          ? fileUrlElement.getAttribute("href")
          : null;
        console.log(fileUrl); // eslint-disable-line

        // 4. Tipo
        const type = row.querySelector("td:nth-child(4)").textContent.trim();
        console.log(type); // eslint-disable-line

        // 5. Resultado
        const result = row
          .querySelector("td:nth-child(5) > div")
          .textContent.trim();
        console.log(result); // eslint-disable-line

        // 6. Acta de votación
        const recordUrl = row
          .querySelector("td:nth-child(6) > a[href]")
          .getAttribute("href");
        console.log(recordUrl); // eslint-disable-line

        // 7. Detalle
        const detailsUrl = row
          .querySelector("td:nth-child(7) > a[href]")
          .getAttribute("href");
        console.log(detailsUrl); // eslint-disable-line

        // 8. Video
        const videoUrlElement = row.querySelector("td:nth-child(8) > a[href]");
        const videoUrl = videoUrlElement
          ? videoUrlElement.getAttribute("href")
          : "";
        console.log(videoUrl); // eslint-disable-line

        // ID que se deduce del link de detalles
        const id = parseInt(detailsUrl.replace("/votaciones/detalleActa/", ""));

        const voting = {
          id,
          date,
          record,
          title,
          fileUrl,
          type,
          result,
          recordUrl,
          detailsUrl,
          videoUrl
        };
        return voting;
      } catch (error) {
        console.error(error); //eslint-disable-line
      }
    });

  /**
   * Verifica si en la tabla aun quedan paginas por pasar
   */
  hasNextPaginationPage = async nextButtonElement => {
    let hasNextPage = false;
    try {
      const nextButtonProp = await nextButtonElement.getProperty("className");
      const nextButtonClass = await nextButtonProp.jsonValue();
      hasNextPage = nextButtonClass.indexOf("disabled") === -1;
    } catch (error) {
      logger.error(`goToNextPaginationPage: ${error.message}`);
    }

    return hasNextPage;
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

      await this.downloadVotesCsvFromPage(page, downloadRelativePath);
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
}
