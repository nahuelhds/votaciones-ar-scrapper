import { post } from "services/http";
import { getContentsFromFile, getDataFromFile } from "services/fs";
import logger from "services/logger";

const API_ENDPOINT = "api/import/ar/senators";

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
  const votings = getDataFromFile(`senadores/${year}.json`);
  for (let originalVoting of votings) {
    if (
      [
        "AFIRMATIVO",
        "NEGATIVO",
        "EMPATE",
        "LEV. VOT.",
        "CANCELADA LEV.VOT.",
        "AUSENTE"
      ].indexOf(originalVoting.result) > -1
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

        if (SAVE_VOTES) {
          const voting = await votingResponse.json();
          const votesEndpoint = `${API_ENDPOINT}/voting/${voting.id}/votes`;
          const originalVotes = JSON.parse(
            getContentsFromFile(
              `/senadores/votos/${year}/${originalVoting.id}.json`
            )
          );
          const votesResponse = await post(votesEndpoint, originalVotes);
          const votes = await votesResponse.json();
          logger.info(
            [
              votesResponse.status,
              votesResponse.statusText,
              originalVoting.id,
              voting.id,
              votes.length,
              votesEndpoint
            ].join(" ")
          );

          if (votesResponse.status >= 400) {
            logger.error(
              `Falló el registro de los votos de la votación #${
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
