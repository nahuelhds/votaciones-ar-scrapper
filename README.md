# Scrapper de las votaciones de Argentina

Este scrapper se encarga de ingresar a los sitios oficiales de Diputados y Senadores de Argentina y descargar el listado de votaciones por año, sus detalles, así como de enviar esa información en crudo al API encargado de normalizar y guardar esa información en una
base de datos.

## Documentación

En el siguiente apartado se explican los métodos existentes para descargar contenido. Los proveedores disponibles al día de hoy son "diputados" y "senadores".

> **IMPORTANTE**
>
> Este proyecto se desarrolló bajo Node 11.14.0 o superior. No se asegura el correcto funcionamiento para versiones anteriores.
>
> Si tenés otra versión de Node y no podés reemplazarla por ésta, te recomiendo utilizar un [gestor de versiones como NVM](https://github.com/nvm-sh/nvm).
> De este modo, podrás cambiar entre versiones sin problemas, ejecutando simplemente `nvm use` desde la raíz del proyecto.
>
> Esto es posible por la existencia del archivo `.nvmrc` que le indica a NVM qué versión utilizar en este contexto.

### Descargar listado de votaciones

```sh
npm start votaciones <proveedor> <año>
```

Descarga el listado de votaciones del año indicado para el proveedor; y genera un archivo en la ruta `./datos/<proveedor>/<año>.json`.
Ejemplo de contenido de un archivo generado con este método:

```js
[
  //...
  {
    id: "3617",
    date: "788072220",
    title:
      "Modificación al Régimen Electoral Nacional, elección de Presidente y Vicepresidente de la Nación, Senadores y Diputados Nacionales - En General",
    type: "Votación Nominal",
    result: "AFIRMATIVO",
    url: "/votacion/3617",
    records: [
      {
        id: "158-S-1994",
        title:
          "Modificación al Régimen Electoral Nacional, elección de Presidente y Vicepresidente de la Nación, Senadores y Diputados Nacionales - En General "
      }
    ]
  }
  //...
];
```

### Completar los detalles de cada votación descargada

```sh
npm start votos <diputados> <año>
```

A partir del archivo descargado con el método anterior, generado en `./datos/diputados/<año>.json`, ingresa a la página
individual de cada una de esas votaciones y toma los detalles particulares de las mismas, así como también descarga el archivo CSV con los votos nominales en la ruta `./datos/diputados/votos/<id>/<archivo>.csv`.

Al finalizar el proceso, reemplazar el archivo original con todos los nuevos datos.

Siguiendo el ejemplo anterior, la votación descargada del listado, ahora tendrá la siguiente estructura:

```js
[
  //...

  {
    id: "3617",
    date: "788072220",
    title:
      "Modificación al Régimen Electoral Nacional, elección de Presidente y Vicepresidente de la Nación, Senadores y Diputados Nacionales - En General",
    type: "Votación Nominal",
    result: "AFIRMATIVO",
    url: "/votacion/3617",
    records: [
      {
        id: "158-S-1994",
        title:
          "Modificación al Régimen Electoral Nacional, elección de Presidente y Vicepresidente de la Nación, Senadores y Diputados Nacionales - En General "
      }
    ],
    period: 112,
    meeting: 43,
    record: 2,
    president: "ROMERO, Carlos Alberto",
    documentUrl:
      "https://votaciones.hcdn.gob.ar/proxy/pdf/1994/112PO03_02_R43.pdf",
    affirmativeCount: "139",
    negativeCount: "0",
    abstentionCount: "0",
    absentCount: "117"
  }
  //...
];
```

### Importar la información generada en el API

```sh
npm start importar <proveedor> <año> [soloEstasVotaciones..]
```

Este método envía en varias peticiones POST la información generada para cada votación del año indicado. Como contrapartida,
el API al que se envíe esta información debe contener tres endpoints preparados para recibir toda esta data. Los mismos
deberían ser:

- POST `votings` Creación de la votación
- POST `votings/<id>/records` Creación de los expedientes de la votación
- POST `votings/<id>/votes` Creación de los votos nominales de la votación

Se puede indicar que sólo se envíe la información de determinadas votaciones a través del argumento opcional `[soloEstasVotaciones..]`.

Por ejemplo: `npm start importar 1994 3617 3618 3619` sólo enviará las votaciones de 1994
con ID 3617, 3618 y 3619.

## ¿Querés ver al bot en acción?

Para ver cómo se inicia el navegador y el bot realiza acción por acción, podés ejecutar el comando en modo de desarrollo
reemplazando `npm start` por `npm run watch` al inicio de cada método.

## Debugging y desarrollo

Si te interesa debuggear o desarrollar otros métodos para scrappear contenido, recomiendo utilizar el comando
`npm run dev` en vez de `npm start`.

Este comando, requiere que tengas el IDE configurado con _auto-attach para Node_.
Si utilizás VSCode, este proyecto lo tiene activado por defecto.

Más información: [https://code.visualstudio.com/blogs/2018/07/12/introducing-logpoints-and-auto-attach]()

## TODOs

- **Typescript.** En especial para definir interfaces que permitan escalar a otros proveedores de una forma estandarizada.
- Desacoplar y simplificar:
  1. Extraer la lógica del scrapper del proveedor
  1. Proveedores sólo con funciones puras.
- Integrar tests
- Logger

## Colaboraciones

Si te interesa colaborar, contactate conmigo a través de [mi cuenta en Twitter](https://twitter.com/nahuelhds).

## nahuelhds

Segui mi actividad en:

- Medium: [@nahuelhds](http://medium.com/@nahuelhds)
- Twitter: [@nahuelhds](https://twitter.com/nahuelhds)

Si te gusta lo que hago y querés darme una mano:

- Podés [invitarme un café en Ko-Fi](https://ko-fi.com/nahuelhds)
- O también [dándome apoyo en Patreon](https://www.patreon.com/nahuelhds)
