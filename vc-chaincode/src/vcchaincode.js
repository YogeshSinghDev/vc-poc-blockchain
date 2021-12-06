'use strict';
const shim = require('fabric-shim');
const util = require('util');

/************************************************************************************************
 * 
 * GENERAL FUNCTIONS 
 * 
 ************************************************************************************************/

/**
 * Executes a query using a specific key
 * 
 * @param {*} key - the key to use in the query
 */
async function queryByKey(stub, key) {
  console.log('============= START : queryByKey ===========');
  console.log('##### queryByKey key: ' + key);

  let resultAsBytes = await stub.getState(key); 
  if (!resultAsBytes || resultAsBytes.toString().length <= 0) {
    throw new Error('##### queryByKey key: ' + key + ' does not exist');
  }
  console.log('##### queryByKey response: ' + resultAsBytes);
  console.log('============= END : queryByKey ===========');
  return resultAsBytes;
}

/**
 * Executes a query based on a provided queryString
 * 
 * I originally wrote this function to handle rich queries via CouchDB, but subsequently needed
 * to support LevelDB range queries where CouchDB was not available.
 * 
 * @param {*} queryString - the query string to execute
 */
async function queryByString(stub, queryString) {
  console.log('============= START : queryByString ===========');
  console.log("##### queryByString queryString: " + queryString);

  // CouchDB Query
  // let iterator = await stub.getQueryResult(queryString);

  // Equivalent LevelDB Query. We need to parse queryString to determine what is being queried
  // In this chaincode, all queries will either query ALL records for a specific docType, or
  // they will filter ALL the records looking for a specific NGO, Donor, Donation, etc. So far, 
  // in this chaincode there is a maximum of one filter parameter in addition to the docType.
  let docType = "";
  let startKey = "";
  let endKey = "";
  let jsonQueryString = JSON.parse(queryString);
  if (jsonQueryString['selector'] && jsonQueryString['selector']['docType']) {
    docType = jsonQueryString['selector']['docType'];
    startKey = docType + "0";
    endKey = docType + "z";
  }
  else {
    throw new Error('##### queryByString - Cannot call queryByString without a docType element: ' + queryString);   
  }

  let iterator = await stub.getStateByRange(startKey, endKey);

  // Iterator handling is identical for both CouchDB and LevelDB result sets, with the 
  // exception of the filter handling in the commented section below
  let allResults = [];
  while (true) {
    let res = await iterator.next();

    if (res.value && res.value.value.toString()) {
      let jsonRes = {};
      console.log('##### queryByString iterator: ' + res.value.value.toString('utf8'));

      jsonRes.Key = res.value.key;
      try {
        jsonRes.Record = JSON.parse(res.value.value.toString('utf8'));
      } 
      catch (err) {
        console.log('##### queryByString error: ' + err);
        jsonRes.Record = res.value.value.toString('utf8');
      }
      // ******************* LevelDB filter handling ******************************************
      // LevelDB: additional code required to filter out records we don't need
      // Check that each filter condition in jsonQueryString can be found in the iterator json
      // If we are using CouchDB, this isn't required as rich query supports selectors
      let jsonRecord = jsonQueryString['selector'];
      // If there is only a docType, no need to filter, just return all
      console.log('##### queryByString jsonRecord - number of JSON keys: ' + Object.keys(jsonRecord).length);
      if (Object.keys(jsonRecord).length == 1) {
        allResults.push(jsonRes);
        continue;
      }
      for (var key in jsonRecord) {
        if (jsonRecord.hasOwnProperty(key)) {
          console.log('##### queryByString jsonRecord key: ' + key + " value: " + jsonRecord[key]);
          if (key == "docType") {
            continue;
          }
          console.log('##### queryByString json iterator has key: ' + jsonRes.Record[key]);
          if (!(jsonRes.Record[key] && jsonRes.Record[key] == jsonRecord[key])) {
            // we do not want this record as it does not match the filter criteria
            continue;
          }
          allResults.push(jsonRes);
        }
      }
      // ******************* End LevelDB filter handling ******************************************
      // For CouchDB, push all results
      // allResults.push(jsonRes);
    }
    if (res.done) {
      await iterator.close();
      console.log('##### queryByString all results: ' + JSON.stringify(allResults));
      console.log('============= END : queryByString ===========');
      return Buffer.from(JSON.stringify(allResults));
    }
  }
}


/************************************************************************************************
 * 
 * CHAINCODE
 * 
 ************************************************************************************************/

let Chaincode = class {

  /**
   * Initialize the state when the chaincode is either instantiated or upgraded
   * 
   * @param {*} stub 
   */
  async Init(stub) {
    console.log('=========== Init: Instantiated / Upgraded vc chaincode ===========');
    return shim.success();
  }

  /**
   * The Invoke method will call the methods below based on the method name passed by the calling
   * program.
   * 
   * @param {*} stub 
   */
  async Invoke(stub) {
    console.log('============= START : Invoke ===========');
    let ret = stub.getFunctionAndParameters();
    console.log('##### Invoke args: ' + JSON.stringify(ret));

    let method = this[ret.fcn];
    if (!method) {
      console.error('##### Invoke - error: no chaincode function with name: ' + ret.fcn + ' found');
      throw new Error('No chaincode function with name: ' + ret.fcn + ' found');
    }
    try {
      let response = await method(stub, ret.params);
      console.log('##### Invoke response payload: ' + response);
      return shim.success(response);
    } catch (err) {
      console.log('##### Invoke - error: ' + err);
      return shim.error(err);
    }
  }

  /**
   * Initialize the state. This should be explicitly called if required.
   * 
   * @param {*} stub 
   * @param {*} args 
   */
  async initLedger(stub, args) {
    console.log('============= START : Initialize Ledger ===========');
    console.log('============= END : Initialize Ledger ===========');
  }

  /************************************************************************************************
   * 
   * Donor functions 
   * 
   ************************************************************************************************/

   /**
   * Creates a new issue
   * 
   * @param {*} stub 
   * @param {*} args - JSON as follows:
   * {
   *    "firstName":"bhupat",
   *    "lastName":"bheda",
   *    "dob":"6/7/1990",
   *    "mobileNumber":"+918866688569"
   *    "emailAddress":"bhupat@webllisto.com"
   *    "testName":"test"
   *    "testResult":"true"
   *    "testDateTime":"2018-10-22T11:52:20.182Z"
   * }
   */
  async createIssuer(stub, args) {
    console.log('============= START : create createIssuer ===========');
    console.log('##### createIssuer arguments: ' + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let key = 'issuer' + json['donorUserName'];
    json['docType'] = 'donor';

    console.log('##### createDonor payload: ' + JSON.stringify(json));

    // Check if the donor already exists
    let donorQuery = await stub.getState(key);
    if (donorQuery.toString()) {
      throw new Error('##### createDonor - This donor already exists: ' + json['donorUserName']);
    }

    await stub.putState(key, Buffer.from(JSON.stringify(json)));
    console.log('============= END : createDonor ===========');
  }

  /**
   * Retrieves a specfic donor
   * 
   * @param {*} stub 
   * @param {*} args 
   */
  async queryDonor(stub, args) {
    console.log('============= START : queryDonor ===========');
    console.log('##### queryDonor arguments: ' + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let key = 'donor' + json['donorUserName'];
    console.log('##### queryDonor key: ' + key);

    return queryByKey(stub, key);
  }

  /**
   * Retrieves all donors
   * 
   * @param {*} stub 
   * @param {*} args 
   */
  async queryAllDonors(stub, args) {
    console.log('============= START : queryAllDonors ===========');
    console.log('##### queryAllDonors arguments: ' + JSON.stringify(args));
 
    let queryString = '{"selector": {"docType": "donor"}}';
    return queryByString(stub, queryString);
  }

  /************************************************************************************************
   * 
   * NGO functions 
   * 
   ************************************************************************************************/

  /**
   * Creates a new NGO
   * 
   * @param {*} stub 
   * @param {*} args - JSON as follows:
   * {
   *    "ngoRegistrationNumber":"6322",
   *    "ngoName":"Pets In Need",
   *    "ngoDescription":"We help pets in need",
   *    "address":"1 Pet street",
   *    "contactNumber":"82372837",
   *    "contactEmail":"pets@petco.com"
   * }
   */
  async createNGO(stub, args) {
    console.log('============= START : createNGO ===========');
    console.log('##### createNGO arguments: ' + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let key = 'ngo' + json['ngoRegistrationNumber'];
    json['docType'] = 'ngo';

    console.log('##### createNGO payload: ' + JSON.stringify(json));

    // Check if the NGO already exists
    let ngoQuery = await stub.getState(key);
    if (ngoQuery.toString()) {
      throw new Error('##### createNGO - This NGO already exists: ' + json['ngoRegistrationNumber']);
    }

    await stub.putState(key, Buffer.from(JSON.stringify(json)));
    console.log('============= END : createNGO ===========');
  }

  /**
   * Retrieves a specfic ngo
   * 
   * @param {*} stub 
   * @param {*} args 
   */
  async queryNGO(stub, args) {
    console.log('============= START : queryNGO ===========');
    console.log('##### queryNGO arguments: ' + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let key = 'ngo' + json['ngoRegistrationNumber'];
    console.log('##### queryNGO key: ' + key);

    return queryByKey(stub, key);
  }

  /**
   * Retrieves all ngos
   * 
   * @param {*} stub 
   * @param {*} args 
   */
  async queryAllNGOs(stub, args) {
    console.log('============= START : queryAllNGOs ===========');
    console.log('##### queryAllNGOs arguments: ' + JSON.stringify(args));
 
    let queryString = '{"selector": {"docType": "ngo"}}';
    return queryByString(stub, queryString);
  }

  /************************************************************************************************
   * 
   * Donation functions 
   * 
   ************************************************************************************************/

  /**
   * Creates a new Donation
   * 
   * @param {*} stub 
   * @param {*} args - JSON as follows:
   * {
   *    "donationId":"2211",
   *    "donationAmount":100,
   *    "donationDate":"2018-09-20T12:41:59.582Z",
   *    "donorUserName":"edge",
   *    "ngoRegistrationNumber":"6322"
   * }
   */
  async createDonation(stub, args) {
    console.log('============= START : createDonation ===========');
    console.log('##### createDonation arguments: ' + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let key = 'donation' + json['donationId'];
    json['docType'] = 'donation';

    console.log('##### createDonation donation: ' + JSON.stringify(json));

    // Confirm the NGO exists
    let ngoKey = 'ngo' + json['ngoRegistrationNumber'];
    let ngoQuery = await stub.getState(ngoKey);
    if (!ngoQuery.toString()) {
      throw new Error('##### createDonation - Cannot create donation as the NGO does not exist: ' + json['ngoRegistrationNumber']);
    }

    // Confirm the donor exists
    let donorKey = 'donor' + json['donorUserName'];
    let donorQuery = await stub.getState(donorKey);
    if (!donorQuery.toString()) {
      throw new Error('##### createDonation - Cannot create donation as the Donor does not exist: ' + json['donorUserName']);
    }

    // Check if the Donation already exists
    let donationQuery = await stub.getState(key);
    if (donationQuery.toString()) {
      throw new Error('##### createDonation - This Donation already exists: ' + json['donationId']);
    }

    await stub.putState(key, Buffer.from(JSON.stringify(json)));
    console.log('============= END : createDonation ===========');
  }

  /**
   * Retrieves a specfic donation
   * 
   * @param {*} stub 
   * @param {*} args 
   */
  async queryDonation(stub, args) {
    console.log('============= START : queryDonation ===========');
    console.log('##### queryDonation arguments: ' + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let key = 'donation' + json['donationId'];
    console.log('##### queryDonation key: ' + key);
    return queryByKey(stub, key);
  }

  /**
   * Retrieves donations for a specfic donor
   * 
   * @param {*} stub 
   * @param {*} args 
   */
  async queryDonationsForDonor(stub, args) {
    console.log('============= START : queryDonationsForDonor ===========');
    console.log('##### queryDonationsForDonor arguments: ' + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let queryString = '{"selector": {"docType": "donation", "donorUserName": "' + json['donorUserName'] + '"}}';
    return queryByString(stub, queryString);
  }

  /**
   * Retrieves donations for a specfic ngo
   * 
   * @param {*} stub 
   * @param {*} args 
   */
  async queryDonationsForNGO(stub, args) {
    console.log('============= START : queryDonationsForNGO ===========');
    console.log('##### queryDonationsForNGO arguments: ' + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let queryString = '{"selector": {"docType": "donation", "ngoRegistrationNumber": "' + json['ngoRegistrationNumber'] + '"}}';
    return queryByString(stub, queryString);
  }

  /**
   * Retrieves all donations
   * 
   * @param {*} stub 
   * @param {*} args 
   */
  async queryAllDonations(stub, args) {
    console.log('============= START : queryAllDonations ===========');
    console.log('##### queryAllDonations arguments: ' + JSON.stringify(args)); 
    let queryString = '{"selector": {"docType": "donation"}}';
    return queryByString(stub, queryString);
  }

  /************************************************************************************************
   * 
   * Spend functions 
   * 
   ************************************************************************************************/

  /**
   * Creates a new Spend
   * 
   * @param {*} stub 
   * @param {*} args - JSON as follows:
   * {
   *    "ngoRegistrationNumber":"6322",
   *    "spendId":"2",
   *    "spendDescription":"Peter Pipers Poulty Portions for Pets",
   *    "spendDate":"2018-09-20T12:41:59.582Z",
   *    "spendAmount":33,
   * }
   */
  async createSpend(stub, args) {
    console.log('============= START : createSpend ===========');
    console.log('##### createSpend arguments: ' + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let key = 'spend' + json['spendId'];
    json['docType'] = 'spend';

    console.log('##### createSpend spend: ' + JSON.stringify(json));

    // Confirm the NGO exists
    let ngoKey = 'ngo' + json['ngoRegistrationNumber'];
    let ngoQuery = await stub.getState(ngoKey);
    if (!ngoQuery.toString()) {
      throw new Error('##### createDonation - Cannot create spend record as the NGO does not exist: ' + json['ngoRegistrationNumber']);
    }

    // Check if the Spend already exists
    let spendQuery = await stub.getState(key);
    if (spendQuery.toString()) {
      throw new Error('##### createSpend - This Spend already exists: ' + json['spendId']);
    }

    await allocateSpend(stub, json);

    await stub.putState(key, Buffer.from(JSON.stringify(json)));
    console.log('============= END : createSpend ===========');
  }

  /**
   * Retrieves a specfic spend
   * 
   * @param {*} stub 
   * @param {*} args 
   */
  async querySpend(stub, args) {
    console.log('============= START : querySpend ===========');
    console.log('##### querySpend arguments: ' + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let key = 'spend' + json['spendId'];
    console.log('##### querySpend key: ' + key);
    return queryByKey(stub, key);
  }

  /**
   * Retrieves spend for a specfic ngo
   * 
   * @param {*} stub 
   * @param {*} args 
   */
  async querySpendForNGO(stub, args) {
    console.log('============= START : querySpendForNGO ===========');
    console.log('##### querySpendForNGO arguments: ' + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let queryString = '{"selector": {"docType": "spend", "ngoRegistrationNumber": "' + json['ngoRegistrationNumber'] + '"}}';
    return queryByString(stub, queryString);
  }

  /**
   * Retrieves all spend
   * 
   * @param {*} stub 
   * @param {*} args 
   */
  async queryAllSpend(stub, args) {
    console.log('============= START : queryAllSpends ===========');
    console.log('##### queryAllSpends arguments: ' + JSON.stringify(args)); 
    let queryString = '{"selector": {"docType": "spend"}}';
    return queryByString(stub, queryString);
  }

  /************************************************************************************************
   * 
   * SpendAllocation functions 
   * 
   ************************************************************************************************/

  /**
   * There is no CREATE SpendAllocation - the allocations are created in the function: allocateSpend
   * 
   * SPENDALLOCATION records look as follows:
   *
   * {
   *   "docType":"spendAllocation",
   *   "spendAllocationId":"c5b39e938a29a80c225d10e8327caaf817f76aecd381c868263c4f59a45daf62-1",
   *   "spendAllocationAmount":38.5,
   *   "spendAllocationDate":"2018-09-20T12:41:59.582Z",
   *   "spendAllocationDescription":"Peter Pipers Poulty Portions for Pets",
   *   "donationId":"FFF6A68D-DB19-4CD3-97B0-01C1A793ED3B",
   *   "ngoRegistrationNumber":"D0884B20-385D-489E-A9FD-2B6DBE5FEA43",
   *   "spendId": "1234"
   * }
   */

  /**
   * Retrieves a specfic spendAllocation
   * 
   * @param {*} stub 
   * @param {*} args 
   */
  async querySpendAllocation(stub, args) {
    console.log('============= START : querySpendAllocation ===========');
    console.log('##### querySpendAllocation arguments: ' + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let key = 'spendAllocation' + json['spendAllocationId'];
    console.log('##### querySpendAllocation key: ' + key);
    return queryByKey(stub, key);
  }

  /**
   * Retrieves the spendAllocation records for a specific Donation
   * 
   * @param {*} stub 
   * @param {*} args 
   */
  async querySpendAllocationForDonation(stub, args) {
    console.log('============= START : querySpendAllocationForDonation ===========');
    console.log('##### querySpendAllocationForDonation arguments: ' + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let queryString = '{"selector": {"docType": "spendAllocation", "donationId": "' + json['donationId'] + '"}}';
    return queryByString(stub, queryString);
  }

  /**
   * Retrieves the spendAllocation records for a specific Spend record
   * 
   * @param {*} stub 
   * @param {*} args 
   */
  async querySpendAllocationForSpend(stub, args) {
    console.log('============= START : querySpendAllocationForSpend ===========');
    console.log('##### querySpendAllocationForSpend arguments: ' + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let queryString = '{"selector": {"docType": "spendAllocation", "spendId": "' + json['spendId'] + '"}}';
    return queryByString(stub, queryString);
  }

  /**
   * Retrieves all spendAllocations
   * 
   * @param {*} stub 
   * @param {*} args 
   */
  async queryAllSpendAllocations(stub, args) {
    console.log('============= START : queryAllSpendAllocations ===========');
    console.log('##### queryAllSpendAllocations arguments: ' + JSON.stringify(args)); 
    let queryString = '{"selector": {"docType": "spendAllocation"}}';
    return queryByString(stub, queryString);
  }

  /************************************************************************************************
   * 
   * Ratings functions 
   * 
   ************************************************************************************************/

  /**
   * Creates a new Rating
   * 
   * @param {*} stub 
   * @param {*} args - JSON as follows:
   * {
   *    "ngoRegistrationNumber":"6322",
   *    "donorUserName":"edge",
   *    "rating":1,
   * }
   */
  async createRating(stub, args) {
    console.log('============= START : createRating ===========');
    console.log('##### createRating arguments: ' + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let key = 'rating' + json['ngoRegistrationNumber'] + json['donorUserName'];
    json['docType'] = 'rating';

    console.log('##### createRating payload: ' + JSON.stringify(json));

    // Check if the Rating already exists
    let ratingQuery = await stub.getState(key);
    if (ratingQuery.toString()) {
      throw new Error('##### createRating - Rating by donor: ' +  json['donorUserName'] + ' for NGO: ' + json['ngoRegistrationNumber'] + ' already exists');
    }

    await stub.putState(key, Buffer.from(JSON.stringify(json)));
    console.log('============= END : createRating ===========');
  }

  /**
   * Retrieves ratings for a specfic ngo
   * 
   * @param {*} stub 
   * @param {*} args 
   */
  async queryRatingsForNGO(stub, args) {
    console.log('============= START : queryRatingsForNGO ===========');
    console.log('##### queryRatingsForNGO arguments: ' + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let queryString = '{"selector": {"docType": "rating", "ngoRegistrationNumber": "' + json['ngoRegistrationNumber'] + '"}}';
    return queryByString(stub, queryString);
  }

  /**
   * Retrieves ratings for an ngo made by a specific donor
   * 
   * @param {*} stub 
   * @param {*} args 
   */
  async queryDonorRatingsForNGO(stub, args) {
    console.log('============= START : queryDonorRatingsForNGO ===========');
    console.log('##### queryDonorRatingsForNGO arguments: ' + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let key = 'rating' + json['ngoRegistrationNumber'] + json['donorUserName'];
    console.log('##### queryDonorRatingsForNGO key: ' + key);
    return queryByKey(stub, key);
  }

  /************************************************************************************************
   * 
   * Blockchain related functions 
   * 
   ************************************************************************************************/

  /**
   * Retrieves the Fabric block and transaction details for a key or an array of keys
   * 
   * @param {*} stub 
   * @param {*} args - JSON as follows:
   * [
   *    {"key": "a207aa1e124cc7cb350e9261018a9bd05fb4e0f7dcac5839bdcd0266af7e531d-1"}
   * ]
   * 
   */
  async queryHistoryForKey(stub, args) {
    console.log('============= START : queryHistoryForKey ===========');
    console.log('##### queryHistoryForKey arguments: ' + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let key = json['key'];
    let docType = json['docType']
    console.log('##### queryHistoryForKey key: ' + key);
    let historyIterator = await stub.getHistoryForKey(docType + key);
    console.log('##### queryHistoryForKey historyIterator: ' + util.inspect(historyIterator));
    let history = [];
    while (true) {
      let historyRecord = await historyIterator.next();
      console.log('##### queryHistoryForKey historyRecord: ' + util.inspect(historyRecord));
      if (historyRecord.value && historyRecord.value.value.toString()) {
        let jsonRes = {};
        console.log('##### queryHistoryForKey historyRecord.value.value: ' + historyRecord.value.value.toString('utf8'));
        jsonRes.TxId = historyRecord.value.tx_id;
        jsonRes.Timestamp = historyRecord.value.timestamp;
        jsonRes.IsDelete = historyRecord.value.is_delete.toString();
      try {
          jsonRes.Record = JSON.parse(historyRecord.value.value.toString('utf8'));
        } catch (err) {
          console.log('##### queryHistoryForKey error: ' + err);
          jsonRes.Record = historyRecord.value.value.toString('utf8');
        }
        console.log('##### queryHistoryForKey json: ' + util.inspect(jsonRes));
        history.push(jsonRes);
      }
      if (historyRecord.done) {
        await historyIterator.close();
        console.log('##### queryHistoryForKey all results: ' + JSON.stringify(history));
        console.log('============= END : queryHistoryForKey ===========');
        return Buffer.from(JSON.stringify(history));
      }
    }
  }
}
shim.start(new Chaincode());
