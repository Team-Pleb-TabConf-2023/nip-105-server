const axios = require('axios');

async function getBitcoinPriceFromCoinbase() {
  try {
    const response = await axios.get('https://api.coinbase.com/v2/prices/BTC-USD/spot');
    const data = response.data;
    return data.data.amount;
  } catch (error) {
    console.error(`Error fetching Bitcoin price from Coinbase: ${error.message}`);
    return 0;
  }
}

async function getBitcoinPriceFromKraken() {
  try {
    const response = await axios.get('https://api.kraken.com/0/public/Ticker?pair=XBTUSD');
    const price = response.data.result.XXBTZUSD.a[0];
    return price;
  } catch (error) {
    console.error(`Error fetching Bitcoin price from Kraken: ${error.message}`);
    return 0;
  }
}

async function getBitcoinPriceFromCoindesk() {
  try {
    const response = await axios.get('https://api.coindesk.com/v1/bpi/currentprice.json');
    const price = response.data.bpi.USD.rate_float;
    return price;
  } catch (error) {
    console.error(`Error fetching Bitcoin price from CoinDesk: ${error.message}`);
    return 0;
  }
}

async function getBitcoinPriceFromGemini() {
  try {
    const response = await axios.get('https://api.gemini.com/v2/ticker/BTCUSD');
    const price = response.data.bid;
    return price;
  } catch (error) {
    console.error(`Error fetching Bitcoin price from Gemini: ${error.message}`);
    return 0;
  }
}

async function getBitcoinPriceFromCoinGecko() {
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&precision=2');
    const price = response.data.bitcoin.usd;
    return price;
  } catch (error) {
    console.error(`Error fetching Bitcoin price from CoinGecko: ${error.message}`);
    return 0;
  }
}

async function getBitcoinPrice() {
  try {
    const cbprice = await getBitcoinPriceFromCoinbase();
    const kprice = await getBitcoinPriceFromKraken();
    const cdprice = await getBitcoinPriceFromCoindesk();
    const gprice = await getBitcoinPriceFromGemini();
    const cgprice = await getBitcoinPriceFromCoinGecko();
    
    const prices = [cbprice, kprice, cdprice, gprice, cgprice].map(Number);
    prices.sort();
    return prices[2];
  } catch (error) {
    console.error(`Error fetching Bitcoin prices: ${error.message}`);
    return 0;
  }
}

module.exports = {
  getBitcoinPriceFromCoinbase,
  getBitcoinPriceFromKraken,
  getBitcoinPriceFromCoindesk,
  getBitcoinPriceFromGemini,
  getBitcoinPriceFromCoinGecko,
  getBitcoinPrice,
};
