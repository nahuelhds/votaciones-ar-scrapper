import yargs from "yargs";

import { getDataFromFile, persistData } from "services/fs";
import logger from "services/logger";

const now = new Date();
const defaultYear = now.getFullYear();

yargs
  .command({
    command: "votaciones <provider> <anio> [anioMax]",
    desc: "Descarga el listado de votaciones de <provider> del <anio> indicado",
    builder: yargs => yargs.default("anio", defaultYear),
    handler: argv =>
      parseVotingsFromYear(argv.provider, argv.anio, argv.anioMax)
  })
  .command({
    command: "votos <provider> <anio> [anioMax] [soloEstasVotaciones..]",
    desc:
      "Descarga los votos cada votación de <provider> realizada durante el <anio> indicado",
    builder: yargs => yargs.default("anio", defaultYear),
    handler: argv =>
      parseVotingsDetailsFromYear(
        argv.provider,
        argv.anio,
        argv.anioMax,
        argv.soloEstasVotaciones
      )
  })
  .command({
    command: "importar <provider> <anio> [soloEstasVotaciones..]",
    desc: "Importa todo lo descargado de <provider> para el <anio> en el API",
    builder: yargs => yargs.default("anio", defaultYear),
    handler: argv =>
      getProvider(argv.provider).api.sendYear(
        argv.anio,
        argv.soloEstasVotaciones
      )
  })
  .demandCommand()
  .help()
  .wrap(72).argv;

/**
 * Devuelve el provider de acuerdo a lo indicado en la consola
 */
function getProvider(providerType) {
  let provider = false;
  switch (providerType) {
    case "diputados":
      provider = require("providers/ar-diputados");
      break;
    case "senadores":
      provider = require("providers/ar-senadores");
      break;
    default:
      throw new Error("UNKOWN_SCRAPPER_PROVIDER");
  }

  return provider.default;
}

async function parseVotingsFromYear(providerType, yearMin, yearMax = null) {
  if (!yearMax) {
    yearMax = yearMin;
  }
  const provider = getProvider(providerType);
  const scrapper = new provider.scrapper();
  for (let year = yearMin; year <= yearMax; year++) {
    try {
      logger.info("INICIO DEL ANALISIS DEL AÑO", year);
      await scrapper.start();
      try {
        await scrapper.parseVotingsFromYear(year);
      } catch (error) {
        logger.error(`parseVotingsFromYear: ${error.message}`);
      }
    } catch (err) {
      logger.error(`Ocurrió un error general durante el proceso ${err}`);
    } finally {
      await scrapper.finish();
      logger.info(`FIN DEL ANALISIS DEL AÑO ${year}`);
    }
  }
  process.exit();
}

async function parseVotingsDetailsFromYear(
  providerType,
  yearMin,
  yearMax = null,
  onlyTheseVotings = []
) {
  if (!yearMax) {
    yearMax = yearMin;
  }
  const provider = getProvider(providerType);
  const scrapper = new provider.scrapper();
  for (let year = yearMin; year <= yearMax; year++) {
    try {
      logger.info(`INICIO ANALISIS DE VOTACIONES DEL AÑO ${year}`);
      try {
        await scrapper.start();
        const database = getDataFromFile(`${providerType}/${year}.json`);
        const page = await scrapper.createPage();
        const editedVotings = [];
        for (let voting of database) {
          let editedVoting = voting;
          if (
            !onlyTheseVotings.length ||
            onlyTheseVotings.indexOf(voting.id) > -1
          ) {
            editedVoting = await scrapper.parseVotingsDetails(
              page,
              voting,
              `${providerType}/votos/${year}`
            );
          }
          editedVotings.push(editedVoting);
        }

        const path = await persistData(
          providerType,
          `${year}.json`,
          editedVotings
        );
        logger.info(`Votaciones actualizadas. Archivo: ${path}`);
      } catch (err) {
        logger.error(err.stack);
      }
    } catch (err) {
      logger.error(err.stack);
    } finally {
      await scrapper.finish();
      logger.info(`FIN ANALISIS DE VOTACIONES DEL AÑO: ${year}`);
    }
  }
  process.exit();
}

// async function fillVotingsDetailsFromYear(providerType, year) {
//   const database = getDataFromFile(`${providerType}/${year}.json`);
//   const relativePath = `${providerType}/votos/${year}`;
//   for (let voting of database) {
//     const votes = getDataFromFile(`${relativePath}/${voting.id}.json`);
//     const editedVotes = [];
//     for (let vote of votes) {
//       vote = { date: voting.date, votingId: voting.id, ...vote };
//       editedVotes.push(vote);
//     }
//     await persistData(relativePath, `${voting.id}.json`, editedVotes);
//   }
//   process.exit();
// }
