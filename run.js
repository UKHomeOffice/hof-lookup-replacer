/* eslint-disable no-cond-assign */
const config = require('./config');

const axios = require('axios');
const { parse } = require('csv-parse');

const logger = require('./lib/logger')({ env: config.env });
const fv = require('./lib/file-vault-utils');

const client = require(`./db/${config.db.client}`);
const Model = require(`./db/models/${config.db.model}`);
const db = new Model();

async function runUpdate() {
  logger.log('info', `Preparing table update for ${config.service.serviceName}`);

  try {
    // Get the most recent CSV data URL from RDS
    const dataFileUrl = await db.getLatestUrl(client);

    // Authenticate with Keycloak and receive token
    const fvToken = await fv.auth();

    // Get the data file as a stream using URL and token
    const response = await axios(fv.fileRequestConfig(dataFileUrl, fvToken));
    const axiosStream = response.data;

    // Setup CSV parser
    const records = [];
    const parser = parse({ from: 2, trim: true, columns: ['cepr', 'dob', 'dtr']});

    axiosStream.on('error', error => {
      logger.log('error', 'Axios stream error: ', error.message);
      throw error;
    });

    axiosStream.on('end', () => {
      parser.end();
    });

    parser.on('readable', () => {
      let record;
      while ((record = parser.read()) !== null) {
        // TODO validate
        records.push(record);
      }
    });

    parser.on('error', error => {
      logger.log('error', 'CSV parsing error: ', error.message);
      throw error;
    });

    parser.on('end', async () => {
      console.log(records);
      logger.log('info', `Records parsed from rows ${records[0].cepr} to ${records[records.length - 1].cepr}`);
    });

    // Start streaming data from Axios into CSV parser
    axiosStream.pipe(parser);
  } catch (error) {
    logger.log('error', 'error:', error);
  }
}

runUpdate();
