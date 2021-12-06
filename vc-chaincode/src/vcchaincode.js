'use strict';
const shim = require('fabric-shim');
// const util = require('util');

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
    await stub.putState('lastId', 0);
    console.log('============= END : Initialize Ledger ===========');
  }

  /************************************************************************************************
   * 
   * Create Issuer functions 
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

    let lastId = await stub.getState('lastId');
    let key = parseInt(lastId) + 1;
    // args is passed as a JSON string
    let json = JSON.parse(args);
    json['docType'] = 'travelers';

    console.log('##### createDonor payload: ' + JSON.stringify(json));

    await stub.putState(key, Buffer.from(JSON.stringify(json)));
    await stub.putState('lastId',key);
    console.log('============= END : createDonor ===========');
  }

  /**
   * Retrieves a specfic donor
   * 
   * @param {*} stub 
   * @param {*} key
   */
  async verify(stub, key) {
    console.log('============= START : queryDonor ===========');
    console.log('##### queryDonor arguments: ' + JSON.stringify(args));

    // args is passed as a JSON string
    // let json = JSON.parse(args);
    // let key = 'donor' + json['donorUserName'];
    console.log('##### queryDonor key: ' + key);

    return queryByKey(stub, key);
  }

}
shim.start(new Chaincode());
