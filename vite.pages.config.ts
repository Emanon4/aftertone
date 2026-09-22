import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath,URL} from 'node:url';
import {copyFile,mkdir,rm} from 'node:fs/promises';
export default defineConfig({
 plugins:[react(),{name:'frontend-assets-only',async closeBundle(){
  // Catalog shards belong to the API asset binding, not the public UI bundle.
  await rm('dist-pages/catalog',{recursive:true,force:true});
  await rm('dist-pages/images',{recursive:true,force:true});
  await mkdir('dist-pages/legal',{recursive:true});
  await Promise.all([
   copyFile('LICENSE','dist-pages/legal/LICENSE.txt'),
   copyFile('THIRD_PARTY_NOTICES.md','dist-pages/legal/THIRD_PARTY_NOTICES.md'),
   copyFile('vendor/shadcn-tailwind-4.13.0.LICENSE.md','dist-pages/legal/shadcn-LICENSE.md'),
  ]);
 }}],
 base:process.env.PAGES_BASE_PATH||'/aftertone/',
 resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},
 build:{outDir:'dist-pages',emptyOutDir:true},
 server:{host:'127.0.0.1',port:5176,proxy:{'/api':{target:'http://127.0.0.1:8788',changeOrigin:true}}},
});
