export const editorIdeas=[
 {id:'dawn',label:'Warm morning light',title:'A warmer start to the day',image:'/assets/generator-inspiration/ink-landscape.jpg',source:'https://www.metmuseum.org/art/collection/search/36071',credit:'Landscape · Wang Hui · The Met Open Access · Public domain',size:'portrait',prompt:'Edit this Chinese ink landscape so the mist and sky glow with soft peach and warm golden morning light. Keep the mountain shapes, pavilion, winding path and trees in the same positions. Preserve the delicate ink brushwork and generous negative space. Do not add objects, text or lettering.',result:'/assets/editor-examples/dawn-result.webp'},
 {id:'background',label:'Change the background',title:'Let the flowers stand out',image:'/assets/generator-inspiration/painterly-flowers.jpg',source:'https://www.metmuseum.org/art/collection/search/436534',credit:'Roses · Vincent van Gogh · The Met Open Access · Public domain',size:'portrait',prompt:'Replace the background behind this vase of roses with a rich, deep indigo blue painted background. Keep the roses, leaves, vase and table in their original positions and preserve their colours and painterly brush texture. Keep the full vase and bouquet visible. Do not add text, lettering or a frame.',result:'/assets/editor-examples/background-result.webp'},
];
export const editorPrompts=[
 {label:'Adjust lighting',prompt:'Keep the main subject and composition. Change the lighting to soft, warm morning light. Preserve the original details. Do not add text.'},
 {label:'Restyle',prompt:'Reinterpret this image as a refined Japanese woodblock illustration. Preserve the main subject, its position and the overall composition. Do not add text.'},
 {label:'Simplify background',prompt:'Simplify the background into a quiet, uncluttered setting. Preserve the main subject, its colours, shape and position. Do not add text.'},
];
export function editorSizeFor(width,height){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return 'portrait';
 const ratio=width/height;
 return [['portrait',2/3],['square',1],['landscape',3/2]].reduce((best,item)=>Math.abs(Math.log(ratio/item[1]))<Math.abs(Math.log(ratio/best[1]))?item:best)[0];
}
