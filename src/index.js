import yargs from "yargs";

import { getDataFromFile, persistData } from "./fs";

import Scrapper from "./scrapper";
import { sendYear } from "./api";

const scrapper = new Scrapper();
const now = new Date();
const defaultYear = now.getFullYear();

yargs
  .command({
    command: "parse <year>",
    desc: "Parse votings from year",
    builder: yargs => yargs.default("year", defaultYear),
    handler: argv => parseVotingsFromYear(argv.year)
  })
  .command({
    command: "parse-details <year>",
    desc: "Parse votings details from year",
    builder: yargs => yargs.default("year", defaultYear),
    handler: argv => parseVotingsDetailsFromYear(argv.year)
  })
  .command({
    command: "send <year> [onlyTheseVotings..]",
    desc: "Send votings to the API",
    builder: yargs => yargs.default("year", defaultYear),
    handler: argv => sendYear(argv.year, argv.onlyTheseVotings)
  })
  .demandCommand()
  .help()
  .wrap(72).argv;

async function parseVotingsFromYear(year) {
  try {
    console.info("INICIO DEL ANALISIS DEL AÑO", year);
    await scrapper.start();
    try {
      const votings = await scrapper.parseVotingsFromYear(year);
      const path = await persistData("ar/deputies/", `${year}.json`, votings);
      console.info("Votaciones guardadas. Archivo:", path);
    } catch (err) {
      console.error(err);
    }
  } catch (err) {
    console.error("Ocurrió un error general durante el proceso", err);
  } finally {
    await scrapper.finish();
    console.info("FIN DEL ANALISIS DEL AÑO", year);
    process.exit();
  }
}

async function parseVotingsDetailsFromYear(year) {
  try {
    console.info("INICIO ANALISIS DE VOTACIONES DEL AÑO", year);
    try {
      await scrapper.start();
      const database = getDataFromFile(`ar/deputies/${year}.json`);
      const page = await scrapper.createPage();
      const editedVotings = [];
      for (let voting of database) {
        const editedVoting = await scrapper.parseVotingsDetails(
          page,
          voting,
          `ar/deputies/votes/${voting.id}`
        );

        editedVotings.push(editedVoting);
      }

      const path = await persistData(
        "ar/deputies/",
        `${year}.json`,
        editedVotings
      );
      console.info("Votaciones actualizadas. Archivo:", path);
    } catch (err) {
      console.error(err);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await scrapper.finish();
    console.info("FIN ANALISIS DE VOTACIONES DEL AÑO", year);
    process.exit();
  }
}
