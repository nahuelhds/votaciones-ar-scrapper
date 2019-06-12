import puppeteer from "puppeteer";
import logger, { pageConsoleLogger } from "services/logger";
import { persistData } from "services/fs";

const __DEV__ = process.env.NODE_ENV !== "production";
const VOTINGS_URI = "https://www.senado.gov.ar/votaciones";

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
    const votingsUri = `${VOTINGS_URI}/actas`;
    logger.info(`Ingresando al sitio ${votingsUri}`);
    await page.goto(votingsUri, { waitUntil: "networkidle2" });
    try {
      logger.info(`Ingresando al año ${year}`);
      await this.gotoYear(page, year);
      const resultsPerPage = 100;
      logger.info(`Resultados por página: ${resultsPerPage}`);
      await this.setMaxPagination(
        page,
        "select[name=actasTable_length]",
        resultsPerPage
      );
    } catch (err) {
      throw err;
    }

    logger.info(`Analizando votaciones...`);

    // Votaciones - Información general
    const rowsSelector = "#actasTable > tbody > tr";
    const rowsEmptySelector = "#actasTable > tbody > tr > td.dataTables_empty";
    const votings = [];
    let hasNextPage = true;
    let currentPage = 0;
    while (hasNextPage) {
      currentPage++;
      try {
        // Check if the data is empty first
        const emptyData = await page.$(rowsEmptySelector);
        if (emptyData !== null) {
          break;
        }

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

  setMaxPagination = async (page, selector, quantity) => {
    const paginationSelect = await page.$(selector);

    const paginationOption = await page.$(
      `${selector} > option[value="${quantity}"]`
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

  parsePageVotingsRows = rows => {
    return rows.map(row => {
      /* eslint-disable no-console */
      try {
        // Columnas:
        // 1. Fecha de sesion (YYYYMMDD)
        const date = row
          .querySelector("td:nth-child(1) > span")
          .textContent.trim();

        console.log(date);

        // 2. Nro. Acta
        const record = parseInt(
          row.querySelector("td:nth-child(2)").textContent.trim()
        );
        console.log(record);

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
        console.log(title);

        // 3.2 Expediente
        const fileUrlElement = fileTitleLink.querySelector("div > a[href]");
        const fileUrl = fileUrlElement
          ? fileUrlElement.getAttribute("href")
          : null;
        console.log(fileUrl);

        // 4. Tipo
        const type = row.querySelector("td:nth-child(4)").textContent.trim();
        console.log(type);

        // 5. Resultado
        const result = row
          .querySelector("td:nth-child(5) > div")
          .textContent.trim();
        console.log(result);

        // 6. Acta de votación
        const recordUrl = row
          .querySelector("td:nth-child(6) > a[href]")
          .getAttribute("href");
        console.log(recordUrl);

        // 7. Detalle
        const detailsUrlElement = row.querySelector(
          "td:nth-child(7) > a[href]"
        );
        const detailsUrl = detailsUrlElement
          ? detailsUrlElement.getAttribute("href")
          : null;
        console.log(detailsUrl);

        // 8. Video
        const videoUrlElement = row.querySelector("td:nth-child(8) > a[href]");
        const videoUrl = videoUrlElement
          ? videoUrlElement.getAttribute("href")
          : null;
        console.log(videoUrl);

        // ID que se deduce del link del acta, ya que es lo que está siempre
        const id = parseInt(
          recordUrl.replace("/votaciones/verActaVotacion/", "")
        );

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
        console.error(error);
      }
      /* eslint-enable no-console */
    });
  };

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
  parseVotingsDetails = async (page, voting, relativePath) => {
    try {
      const pageUrl = `${VOTINGS_URI}/detalleActa/${voting.id}`;
      logger.info(`\nINICIO VOTACION #${voting.id}`);
      logger.info(pageUrl);

      await page.goto(pageUrl, {
        waitUntil: "networkidle2"
      });

      logger.info(`\nObteniendo datos...`);

      //parseInt(document.querySelector('.tabbable .tab-pane > div > div.row > div:nth-child(2) > .row > .col-lg-3:nth-child(1)').textContent)
      voting.affirmativeCount = await this.getCountAsync(page, 1);
      logger.info(`Votos afirmativos\t${voting.affirmativeCount}`);
      voting.negativeCount = await this.getCountAsync(page, 2);
      logger.info(`Votos negativos\t${voting.negativeCount}`);
      voting.abstentionCount = await this.getCountAsync(page, 3);
      logger.info(`Abstenciones\t${voting.abstentionCount}`);
      voting.absentCount = await this.getCountAsync(page, 4);
      logger.info(`Ausentes\t\t${voting.absentCount}`);

      await this.setMaxPagination(page, "select[name=tabla_length]", 100);

      const rowsSelector = "#tabla > tbody > tr";
      const votes = await page.$$eval(
        rowsSelector,
        this.parsePageVotingVotesRows
      );

      await persistData(relativePath, `${voting.id}.json`, votes);
    } catch (err) {
      logger.error(err.stack);
    } finally {
      logger.info(`FIN VOTACION #${voting.id}\n`);
    }

    return voting;
  };

  /**
   * Obtiene el conteo de afirmativos/negativos/abstenciones/ausentes
   */
  getCountAsync = async (page, nthChild) => {
    const countSelector =
      ".tabbable .tab-pane > div > div.row > div:nth-child(2) > .row > .col-lg-3";
    const countElement = await page.$(
      `${countSelector}:nth-child(${nthChild})`
    );
    const countProp = await countElement.getProperty("textContent");
    return parseInt(await countProp.jsonValue());
  };

  /**
   * Descarga el CSV con los votos
   */
  parsePageVotingVotesRows = rows =>
    rows.map(row => {
      /* eslint-disable no-console */
      try {
        // Columnas:
        // 1. Foto y enlace al perfil de senador
        const profileUrl = row
          .querySelector("td:nth-child(1) > a")
          .getAttribute("href");

        const legislatorId = parseInt(profileUrl.replace(/.*\/([0-9]+)/, "$1"));

        console.log(legislatorId);
        console.log(profileUrl);

        const photoUrl = row
          .querySelector("td:nth-child(1) > a > img")
          .getAttribute("src");

        console.log(photoUrl);

        // 2. Senador
        const legislator = row
          .querySelector("td:nth-child(2)")
          .textContent.trim();
        console.log(legislator);

        // 3. Bloque
        const party = row.querySelector("td:nth-child(3)").textContent.trim();
        console.log(party);

        // 4. Provincia
        const region = row.querySelector("td:nth-child(4)").textContent.trim();
        console.log(region);

        // 5. Cómo votó
        const vote = row
          .querySelector("td:nth-child(5) > div")
          .textContent.trim();
        console.log(vote);

        const data = {
          legislatorId,
          legislator,
          party,
          region,
          vote,
          profileUrl,
          photoUrl
        };
        return data;
      } catch (error) {
        console.error(error);
      }
      /* eslint-enable no-console */
    });
}
