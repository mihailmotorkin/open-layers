import devCertificate from 'devcert';
import * as fs from 'node:fs';

(async () => {
  try {
    const data = await devCertificate.certificateFor('localhost');

    fs.mkdirSync('./cert', { recursive: true });

    for (const key of Object.keys(data)) {
      fs.writeFileSync(`./cert/localhost.${key}`, data[key]);
    }

    console.log('Сертификаты созданы в папке /cert');
  } catch (error) {
    console.error('Ошибка:', error);
  }
})();
