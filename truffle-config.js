const { projectId, mnemonic, etherscanKey, bscscanKey } = require('./secrets.json');
const Web3 = require('web3');
const web3 = new Web3();
var HDWalletProvider = require("truffle-hdwallet-provider");

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*"
    },
    ropsten: {
      provider: function() {
        return new HDWalletProvider(mnemonic, `https://ropsten.infura.io/v3/${projectId}`)
      },
      network_id: 3,
      gas: 7000000      //make sure this gas allocation isn't over 4M, which is the max
    },
    kovan: {
      provider: function() {
        return new HDWalletProvider(mnemonic, `https://kovan.infura.io/v3/${projectId}`)
      },
      network_id: 42,
      gas: 7000000      //make sure this gas allocation isn't over 4M, which is the max
    },
    live: {
      provider: function() {
        return new HDWalletProvider(mnemonic, `https://bsc-dataseed.binance.org/`)
      },
      network_id: 56,
      gas: 3000000,      //make sure this gas allocation isn't over 4M, which is the max
      gasPrice: web3.utils.toWei('16', 'gwei')

    }
  },
  //
  compilers: {
    solc: {
      version: "0.7.6",
      settings: {          // See the solidity docs for advice about optimization and evmVersion
        optimizer: {
          enabled: true,
          runs: 200
        },
      }
    }

  },
  plugins: [
    "solidity-coverage"
  ],
  api_keys: {
    bscscan: bscscanKey,
    etherscan: etherscanKey
  }
};

