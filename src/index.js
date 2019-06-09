import yargs from "yargs";

import { getDataFromFile, persistData } from "services/fs";
import provider from "providers/ar-senadores";
import logger from "services/logger";

const scrapper = new provider.scrapper();
const now = new Date();
const defaultYear = now.getFullYear();

yargs
  .command({
    command: "listado <anio>",
    desc: "Descarga el listado de votaciones del <anio> indicado",
    builder: yargs => yargs.default("anio", defaultYear),
    handler: argv => parseVotingsFromYear(argv.anio)
  })
  .command({
    command: "detalles <anio>",
    desc:
      "Descarga los detalles y archivos CSV de cada votación realizada durante el <anio> indicado",
    builder: yargs => yargs.default("anio", defaultYear),
    handler: argv => parseVotingsDetailsFromYear(argv.anio)
  })
  .command({
    command: "importar <anio> [soloEstasVotaciones..]",
    desc: "Importa todo lo descargado para el <anio> en el API",
    builder: yargs => yargs.default("anio", defaultYear),
    handler: argv => provider.api.sendYear(argv.anio, argv.soloEstasVotaciones)
  })
  .demandCommand()
  .help()
  .wrap(72).argv;

async function parseVotingsFromYear(year) {
  try {
    logger.log("INICIO DEL ANALISIS DEL AÑO", year);
    await scrapper.start();
    try {
      const votings = await scrapper.parseVotingsFromYear(year);
      const path = await persistData("diputados", `${year}.json`, votings);
      logger.info(`Votaciones guardadas. Archivo: ${path}`);
    } catch (err) {
      logger.error(err);
    }
  } catch (err) {
    logger.error(`Ocurrió un error general durante el proceso ${err}`);
  } finally {
    await scrapper.finish();
    logger.info(`FIN DEL ANALISIS DEL AÑO ${year}`);
    process.exit();
  }
}

async function parseVotingsDetailsFromYear(year) {
  try {
    logger.info(`INICIO ANALISIS DE VOTACIONES DEL AÑO ${year}`);
    try {
      await scrapper.start();
      const database = getDataFromFile(`diputados/${year}.json`);
      const page = await scrapper.createPage();
      const editedVotings = [];
      for (let voting of database) {
        const editedVoting = await scrapper.parseVotingsDetails(
          page,
          voting,
          `diputados/votos/${voting.id}`
        );

        editedVotings.push(editedVoting);
      }

      const path = await persistData(
        "diputados",
        `${year}.json`,
        editedVotings
      );
      logger.info(`Votaciones actualizadas. Archivo: ${path}`);
    } catch (err) {
      logger.error(err);
    }
  } catch (err) {
    logger.error(err);
  } finally {
    await scrapper.finish();
    logger.info(`FIN ANALISIS DE VOTACIONES DEL AÑO: ${year}`);
    process.exit();
  }
}
