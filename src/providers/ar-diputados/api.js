import { post } from "services/http";
import { getContentFromFileInFolder, getDataFromFile } from "services/fs";
import logger from "services/logger";

const API_ENDPOINT = "api/import/ar/deputies";

const SAVE_RECORDS = true;
const SAVE_VOTES = false;

/**
 * Sincroniza la información de todas las votaciones
 * del año dado
 *
 * Si se indica un filtro de determinadas votaciones,
 * sólo se sincronizan esas
 *
 * @param {integer} year
 * @param {array} onlyTheseVotings
 */
export const sendYear = async (year, onlyTheseVotings = []) => {
  const votings = getDataFromFile(`diputados/${year}.json`);
  for (let originalVoting of votings) {
    if (
      ["AFIRMATIVO", "NEGATIVO", "EMPATE"].indexOf(originalVoting.result) > -1
    ) {
      if (
        onlyTheseVotings.length &&
        onlyTheseVotings.indexOf(parseInt(originalVoting.id)) === -1
      ) {
        continue;
      }
      try {
        const votingEndpoint = `${API_ENDPOINT}/voting`;
        const votingResponse = await post(votingEndpoint, originalVoting);
        logger.info(
          [
            votingResponse.status,
            votingResponse.statusText,
            originalVoting.id,
            votingEndpoint
          ].join(" ")
        );

        if (votingResponse.status >= 400) {
          throw new Error(
            `Falló la creación de la votación #${originalVoting.id}`
          );
        }

        const voting = await votingResponse.json();
        if (SAVE_RECORDS) {
          const recordsEndpoint = `${API_ENDPOINT}/voting/${voting.id}/records`;
          const recordsResponse = await post(
            recordsEndpoint,
            originalVoting.records
          );
          logger.info(
            [
              recordsResponse.status,
              recordsResponse.statusText,
              originalVoting.id,
              recordsEndpoint
            ].join(" ")
          );

          if (recordsResponse.status >= 400) {
            logger.error(
              `Falló la creación de los registros de la votación #${
                originalVoting.id
              }`
            );
          }
        }

        if (SAVE_VOTES) {
          const votesEndpoint = `${API_ENDPOINT}/voting/${voting.id}/votes`;
          const votesResponse = await post(
            votesEndpoint,
            getContentFromFileInFolder(`diputados/votos/${originalVoting.id}`)
          );
          logger.info(
            votesResponse.status,
            votesResponse.statusText,
            originalVoting.id,
            votesEndpoint
          );

          if (votesResponse.status >= 400) {
            logger.error(
              `Falló el registro de las votaciones de la votación #${
                originalVoting.id
              }`
            );
          }
        }
      } catch (err) {
        logger.error(err.stack);
      }
    } else {
      logger.error(
        `La votación #${originalVoting.id} no tiene un resultado esperado: ${
          originalVoting.result
        }`
      );
    }
  }
};
