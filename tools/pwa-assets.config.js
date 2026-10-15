// Generates the app icons in public/ from the shuttlecock in public/favicon.svg:
//   npm run icons
// Maskable and Apple icons get the hall's petrol colour behind the shuttle.
const hall = '#0e3b43';

export default {
  images: ['public/favicon.svg'],
  headLinkOptions: { preset: '2023' },
  preset: {
    transparent: { sizes: [64, 192, 512], favicons: [[48, 'favicon.ico']] },
    maskable: { sizes: [512], padding: 0.3, resizeOptions: { background: hall } },
    apple: { sizes: [180], padding: 0.3, resizeOptions: { background: hall } },
  },
};
