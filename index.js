'use strict';

const fs = require('fs');
const https = require('https');

const year = process.argv[2];
if (!year) {
  console.error('Usage: node index.js <year>');
  console.error('  example: node index.js 2016');
  process.exit(1);
}

const mkdirp = path => {
  try {
    fs.mkdirSync(path);
  } catch(e) {
    if (e.code !== 'EEXIST') throw e;
  }
};

const months = Array.apply(null, { length: 12  }).map(Number.call, Number).map(n => n + 1);

months.forEach(m => {
  console.log(`Downloading monthly recap ${m}`);
  const result = require('child_process').spawnSync('curl', [
    `https://www.car2go.com/rest/api/statements/own/sorted/${year},${m},1,0,0,0,UTC?_=1453322332055`,
    '--compressed',
    '-b', 'cookies.txt'
  ]);
  if (result.status !== 0) {
    console.error(result.error);
    return;
  }
  fs.writeFileSync(`${m}.json`, result.stdout);
  console.log(`Downloaded file ${m}.json`);
});

const fileNames = months.map(i => `${i}.json`);

const downloadDir = 'invoices';
mkdirp(downloadDir);

fileNames.forEach(fileName => {

  const f = fs.readFileSync(fileName, 'utf8');
  const json = JSON.parse(f);
  if (!json.body.StatementHierarchyContainerRTO) {
    return;
  }

  json.body.StatementHierarchyContainerRTO.paymentprofiles.creditcards.paid.forEach(invoice => {
    const date = invoice.statementDate;
    const matches = date.match(/(\d+),(\d+),(\d+),\d+,\d+,\d+,UTC/);
    const year = matches[1];
    const month = matches[2];
    const day = matches[3];
    const fileName = `car2go-${year}-${month}-${day}.pdf`;
    const output = fs.createWriteStream(`${downloadDir}/${fileName}`)
    console.log(`Processing invoice ${invoice.statementId}`);
    const curl = require('child_process').spawn('curl', [
      `https://www.car2go.com/rest/api/statements/own/pdf/${invoice.statementId}`,
      '--compressed',
      '-b', 'cookies.txt'
    ]);
    curl.stdout.on('data', data => output.write(data));
    curl.stdout.on('end', () => {
       output.end();
       console.log(`file ${fileName} downloaded to ${downloadDir}`);
     });
    curl.stderr.on('error', err => console.error(err));
    curl.on('exit', code => {
      if (code !== 0) {
        console.error(`Failed with code ${code}`);
      }
    });
  });

});

const s = fileNames.reduce((sum, fileName) => {

  const f = fs.readFileSync(fileName, 'utf8');

  const json = JSON.parse(f);
  if (!json.body.StatementHierarchyContainerRTO) {
    return sum;
  }
  const s = json.body.StatementHierarchyContainerRTO.paymentprofiles.creditcards.paid.reduce((sum, p) => {
    const x = p.amountGross.replace(/EUR (\d+.\d+)/, '$1')
    return sum + parseFloat(x);
  }, 0);

  console.log(`On month ${fileName} you spent ${s.toFixed(2)} €`);

  return sum + s;
}, 0);

console.log(`In ${year} you spent a total of ${s.toFixed(2)}`);

