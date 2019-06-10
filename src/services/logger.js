import winston from "winston";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  defaultMeta: { service: "user-service" },
  transports: [
    //
    // - Write to all logs with level `info` and below to `combined.log`
    // - Write all logs error (and below) to `error.log`.
    //
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" })
  ]
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple()
    })
  );
}

export default logger;

/**
 * Procesa el console.log|info|error|warn que viene de dentro de las paginas accedidas
 * por Puppeteer
 *
 * @see https://github.com/GoogleChrome/puppeteer/issues/3397#issuecomment-429325514
 * @param {Object} msg
 */
export const pageConsoleLogger = async msg => {
  if (process.env.NODE_ENV !== "production") {
    const args = await msg.args();
    args.forEach(async arg => {
      const val = await arg.jsonValue();
      // value is serializable
      if (JSON.stringify(val) !== JSON.stringify({})) {
        logger.info(val);
        // value is unserializable (or an empty oject)
      } else {
        const { type, subtype, description } = arg._remoteObject;
        switch (subtype) {
          case "error":
            logger.error(description);
            break;
          default:
            logger.info(
              `type: ${type}, subtype: ${subtype}, description:\n ${description}`
            );
        }
      }
    });
  }
};
