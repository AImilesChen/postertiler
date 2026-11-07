export const ditherExamples=[
 {id:'portrait',name:'Light, shadow and fine grain',short:'Portrait',preset:'natural',artist:'Johannes Vermeer',title:'Young Woman with a Water Pitcher',source:'https://www.metmuseum.org/art/collection/search/437881',alt:'A woman in a white headdress beside a sunlit window'},
 {id:'waves',name:'A retro, two-tone print',short:'Woodblock',preset:'retro',artist:'Katsushika Hokusai',title:'Under the Wave off Kanagawa',source:'https://www.metmuseum.org/art/collection/search/45434',alt:'A sweeping ocean wave above small boats and Mount Fuji'},
 {id:'irises',name:'Colour with a pixel texture',short:'Flowers',preset:'colour',artist:'Vincent van Gogh',title:'Irises',source:'https://www.metmuseum.org/art/collection/search/436528',alt:'Blue irises in a vase against a warm yellow background'},
];
export const ditherAsset=(id,suffix='')=>`/assets/dither-examples/${id}${suffix}${suffix?'.png':'.jpg'}`;
