import type { ArticleInput } from '../schemas/article';
import type { Coverage } from '../schemas/coverage';

export const SMI_TEXT = [
  'El Consejo de Ministros ha aprobado este martes una subida del salario mínimo interprofesional que lo sitúa en el nivel más alto de toda Europa, una medida que según el ministerio beneficiará a 2,5 millones de trabajadores.',
  'Mientras tanto, la patronal, fiel a su costumbre, vuelve a anteponer sus beneficios a la dignidad de quienes sostienen el país, y amenaza con un apocalipsis de empleo que nunca llega.',
  'Desde 2018 el SMI ha crecido un 61 % sin que se haya destruido empleo, según fuentes sindicales consultadas por este diario.',
].join('\n\n');

export const SMI_ARTICLE: ArticleInput = {
  url: 'https://eldiariorojo.example/economia/smi',
  title: 'El salario mínimo bate récords mientras la patronal sigue en pie de guerra | El Diario Rojo',
  text: SMI_TEXT,
  lang: 'es',
  siteName: 'El Diario Rojo',
  byline: 'Ana Pérez',
};

export const SMI_COVERAGES: Coverage[] = [
  { outletId: 'agencia', outlet: 'Agencia Ibérica', url: 'https://agenciaiberica.example/smi', title: 'El Gobierno aprueba la subida del SMI con el rechazo de la patronal', lean: 49, bucket: 'center' },
  { outletId: 'heraldo', outlet: 'El Heraldo Azul', url: 'https://heraldoazul.example/smi', title: 'El Gobierno impone otra subida del SMI de espaldas a las empresas', lean: 76, bucket: 'right' },
  { outletId: 'cronica', outlet: 'Crónica Sur', url: 'https://cronicasur.example/smi', title: 'El SMI sube y llega a 2,5 millones de trabajadores', lean: 30, bucket: 'left' },
];
