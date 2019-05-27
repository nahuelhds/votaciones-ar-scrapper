import { post } from "services/httpService.js";
import {
  getContentFromFileInFolder,
  getDataFromFile
} from "services/filesystemService.js";

const API_ENDPOINT = process.env.API_ENDPOINT_DIPUTADOS;

const SAVE_RECORDS = true;
const SAVE_VOTES = true;

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
        console.info(
          votingResponse.status,
          votingResponse.statusText,
          originalVoting.id,
          votingEndpoint
        );

        if (votingResponse.status >= 400) {
          throw new Error(
            `Falló la creación de la votación #${originalVoting.id}`
          );
        }

        const voting = await votingResponse.json();
        if (SAVE_RECORDS) {
          const recordsEndpoint = `${API_ENDPOINT}/votings/${
            voting.id
          }/records`;
          const recordsResponse = await post(
            recordsEndpoint,
            originalVoting.records
          );
          console.info(
            recordsResponse.status,
            recordsResponse.statusText,
            originalVoting.id,
            recordsEndpoint
          );

          if (recordsResponse.status >= 400) {
            console.warn(
              `Falló la creación de los registros de la votación #${
                originalVoting.id
              }`
            );
          }
        }

        if (SAVE_VOTES) {
          const votesEndpoint = `${API_ENDPOINT}/votings/${voting.id}/votes`;
          const votesResponse = await post(
            votesEndpoint,
            getContentFromFileInFolder(`diputados/votes/${originalVoting.id}`)
          );
          console.info(
            votesResponse.status,
            votesResponse.statusText,
            originalVoting.id,
            votesEndpoint
          );

          if (votesResponse.status >= 400) {
            console.warn(
              `Falló el registro de las votaciones de la votación #${
                originalVoting.id
              }`
            );
          }
        }
      } catch (err) {
        console.warn(err);
      }
    } else {
      console.error(
        `La votación #${originalVoting.id} no tiene un resultado esperado`,
        originalVoting.result
      );
    }
  }
};
