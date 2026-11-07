export const extraGuides = [
 {slug:'printer-margins-and-overlap',title:'Printer Margins, Overlap and Poster Gaps',category:'Paper & size',intro:'Understand white printer edges, repeated image strips and deliberate spacing between panels.',steps:[
  ['Leave room for your printer','Printer margins are the white edges around each sheet. Set enough space for the area your printer cannot print; the minimum varies by printer and paper.'],
  ['Use overlap to line up the image','Overlap repeats a narrow strip of the picture on neighbouring sheets. It helps you align the image during assembly and is counted only once in the finished dimensions.'],
  ['Choose continuous or framed output','A continuous poster joins the picture after trimming or covering the white edges. Framed Grid deliberately leaves a gap between trimmed panels and omits image strips in those gaps.'],
  ['Test the join before the full print','Print an adjoining pair at 100%, trim the joining edges and align the repeated image. Increase printer margins if your printer clips content, then generate the PDF again.']
 ]},
 {slug:'fit-vs-fill-poster',title:'Fit vs Fill: Keep the Whole Image or Crop the Edges',category:'Image layout',intro:'Choose whether to keep every part of your image or fill the finished poster canvas.',steps:[
  ['Start with the finished canvas','Choose a sheet layout or enter the finished width and height. The canvas proportions and image proportions determine whether extra space or cropping is needed.'],
  ['Choose Fit for the whole picture','Fit preserves the image proportions and keeps the whole picture inside the canvas. If the shapes differ, some canvas area remains blank.'],
  ['Choose Fill for edge-to-edge artwork','Fill preserves proportions while covering the canvas, so image edges may be cropped. Check faces, text and other important details in the preview.'],
  ['Review both views before exporting','Original shows the assembled result with page divisions. Printed Sheets explains paper, image area and overlap. Changing Fit or Fill does not add source detail.']
 ]},
 {slug:'paper-size-and-orientation',title:'Choose Paper Size, Orientation and Poster Dimensions',category:'Paper & size',intro:'Match A4, US Letter or A3 to your printer and choose the right finished poster size.',steps:[
  ['Choose paper your printer supports','Select A4 (210 × 297 mm), US Letter (215.9 × 279.4 mm) or A3 (297 × 420 mm). A3 requires a printer that supports A3 sheets.'],
  ['Compare portrait and landscape','For a fixed finished size, try both sheet orientations with the same margins and overlap. The paper count can change; landscape is not always the smaller job.'],
  ['Set sheets or exact dimensions','Sheet mode sets the number across and down. Exact size sets the finished canvas in mm, cm or inches, with excess paper trimmed after assembly. Check whether the aspect-ratio lock is on.'],
  ['Match the PDF when printing','Keep the PDF paper and orientation in the printer dialog. Use Actual Size / 100%, then measure a calibration page before printing the full poster.']
 ]},
];

const visual=(src,alt,caption,step)=>({src,alt,caption,step});
export const guideMeta={
 'how-to-make-a-block-poster':{
  icon:'poster',keywords:['beginner','start','tutorial','upload','wall art','first poster'],takeaway:'Start with one image, choose the finished size, then check one print before making the whole poster.',
  details:['Keep the original file if you can. A screenshot or a heavily compressed copy may lose detail when printed at a larger physical size. All ordinary poster preparation happens locally in your browser.','Paper size describes each sheet. Finished poster size describes the assembled artwork. Printer margins and overlap affect how much new image area each sheet contributes.','Use the assembled view to check the picture and cropping. Use Printed Sheets to understand where the paper, image area and overlaps fall.','A 100 mm line should measure 100 mm on the physical print in both directions. A screen preview or a ruler held against the screen is not a print calibration.','The PDF, calibration page and assembly map are separate downloads. Keep the assembly map nearby so row letters and column numbers remain easy to follow.'],
  visual:visual('/assets/homepage/step-size.webp','PosterTiler sheet-layout controls and a two-by-two sheet plan','Tool screenshot: sheet settings and the calculated layout. Physical print results depend on your printer.',2),
  related:['paper-size-and-orientation','how-to-print-a-pdf-at-actual-size','how-to-assemble-a-tiled-poster'],tool:['Make a poster','/#poster-editor']
 },
 'how-to-print-an-image-on-multiple-pages':{
  icon:'sheets',keywords:['split','tile','tiling','multiple pages','multiple sheets','2x2','4 pages','a4','letter','a3'],takeaway:'One image becomes several printable sheets. Margins and overlap are part of the layout calculation.',
  details:['Across means columns and down means rows. A 2 × 2 layout uses four poster pages; the calibration and assembly documents are separate.','For two portrait A4 columns with 5 mm left and right margins and 10 mm overlap, the finished width is 2 × 200 − 10 = 390 mm. This assumes printed labels are off.','If you change paper after generating the PDF, the physical layout may no longer match the settings. Generate a new PDF if the paper needs to change.','A small test checks the two things a preview cannot establish: your printer’s scale and how well the join works on your chosen paper.'],
  visual:visual('/assets/homepage/example-page.webp','An actual example poster PDF page with image content and print guides','Digital preview of an example PDF page. Your file uses your own image and settings.',2),
  related:['printer-margins-and-overlap','paper-size-and-orientation','how-to-assemble-a-tiled-poster'],tool:['Calculate a poster size','/tools/poster-size-calculator']
 },
 'how-to-print-a-pdf-at-actual-size':{
  icon:'ruler',keywords:['scale','scaling','100%','100 percent','actual size','wrong size','too small','too big','shrink','fit to page','calibration'],takeaway:'Match the paper. Print at Actual Size / 100%. Measure both 100 mm reference lines on paper.',
  details:['Check the PDF page properties as well as the paper loaded in your printer. If those sizes differ, generate a new PDF for the paper you will actually use.','Some PDF readers use names such as “Actual size”, “100%” or “Custom scale”. Disable automatic fitting or shrinking. The exact controls vary by browser, reader and printer.','Check both directions with a physical ruler on the same sheet. If either measurement differs, correct the print setup before continuing. Keep the test sheet as a reference for the full job.','Automatic scaling can hide a mismatch by shrinking everything. Correct the paper and margins rather than assuming a smaller print is accurate.'],
  visual:visual('/assets/guides/calibration-preview.webp','Actual calibration PDF showing horizontal and vertical 100 mm reference lines','Preview of the A4 calibration PDF generated by the print engine. Download the PDF below; do not print this preview image.',2),
  related:['paper-size-and-orientation','printer-margins-and-overlap','how-to-assemble-a-tiled-poster'],tool:['Make a poster','/#poster-editor']
 },
 'how-to-assemble-a-tiled-poster':{
  icon:'assembly',keywords:['assemble','assembly','join','joining','trim','cut','tape','align','alignment','sheet order','a1','mismatch'],takeaway:'Start at A1. Trim the joining white edges, align the repeated picture and secure the join.',
  details:['A1 is the top-left position. Row letters go down the poster; column numbers go across. Print order can change, but a page’s position label does not.','At an internal vertical join, trim the left white edge of the right-hand sheet. At a horizontal join, trim the top white edge of the lower sheet. Follow the guides for your actual job and avoid cutting away the repeated image before checking the join.','Overlap is repeated picture, not extra finished width. Place the repeated strips over one another until details match. With zero overlap, join the trimmed image edges directly.','Check the whole arrangement before permanent mounting. Trim outside excess to the finished boundary. Framed Grid is different: its deliberate panel spacing is part of the finished size.'],
  visual:visual('/assets/homepage/example-assembly.webp','An example assembly PDF with A1 and A2 above B1 and B2','Example assembly map for a 2 × 2 poster. Download your own map from your poster’s export step.',0),
  related:['printer-margins-and-overlap','how-to-print-a-pdf-at-actual-size','how-to-make-a-block-poster'],tool:['Prepare your poster','/#poster-editor']
 },
 'image-resolution-for-large-posters':{
  icon:'quality',keywords:['blurry','blur','soft','sharp','clarity','resolution','ppi','dpi','pixels','upscale','ai','enhance','quality'],takeaway:'PPI changes with physical print size. Use your best source and inspect important details before printing.',
  details:['The free poster tool can scale an image, but scaling alone does not recover detail lost to blur, compression or a small source.','PPI is image pixels divided by the physical printed image size in inches. A 1200-pixel-wide image printed 20 inches wide has 60 PPI. Paper count by itself is not a resolution measurement.','Artwork style, compression, printer settings and viewing distance all affect the result. A single PPI value cannot guarantee how a particular print will look.','Optional AI Image Upscaler can produce a larger pixel image using cloud processing and separate AI credits. It may change details and cannot guarantee recovery of true missing information. Compare its result, then use it in the free poster maker if suitable.'],
  related:['fit-vs-fill-poster','how-to-print-a-pdf-at-actual-size','how-to-make-a-block-poster'],tool:['Explore AI Image Upscaler','/tools/ai-image-upscaler']
 },
 'printer-margins-and-overlap':{
  icon:'margins',keywords:['white','white border','borders','margin','margins','overlap','gaps','spacing','seam','edge','clipping'],takeaway:'Margins are white paper edges. Overlap repeats image content. Framed Grid adds deliberate gaps.',
  details:['Margins are normally removed or covered at the internal joins of a continuous poster. They are not intended as blank strips through the finished artwork.','With 5 mm margins, labels off and 10 mm overlap, two portrait A4 columns cover 390 mm rather than 400 mm. Repeated content is counted once.','Choose Framed Grid only when you want separated panels. Its gap is physical spacing between the mounted panels, unlike white printer margins on untrimmed paper.','If a join remains wrong, check the page labels, paper, orientation and printed scale before cutting more away. Keep the original files so you can regenerate the job if necessary.'],
  visual:visual('/assets/homepage/print-overlap.svg','Calculated two-sheet layout with a shaded repeated image overlap','Layout illustration calculated from the print engine: overlap repeats the picture and is not a white gap.',1),
  related:['how-to-assemble-a-tiled-poster','how-to-print-a-pdf-at-actual-size','fit-vs-fill-poster'],tool:['Check a layout','/tools/poster-size-calculator']
 },
 'fit-vs-fill-poster':{
  icon:'crop',keywords:['fit','fill','crop','cropped','cut off','stretch','aspect ratio','blank space','whole image'],takeaway:'Fit keeps the complete image with possible blank canvas. Fill covers the canvas with possible cropping.',
  details:['An image and a canvas with the same aspect ratio need little or no extra space or cropping. Different shapes require a choice about which result you prefer.','Fit is useful for artwork with important edges, lettering or a complete subject that should stay visible. Blank canvas inside the final boundary is part of the finished poster.','Fill can crop important content even if the physical poster size is correct. Changing brightness or colour will not bring cropped edges back.','Margins and overlap still apply to the paper layout. Fit whitespace is separate from printer margins and from unused paper beyond an exact-size canvas.'],
  related:['image-resolution-for-large-posters','printer-margins-and-overlap','how-to-print-an-image-on-multiple-pages'],tool:['Compare Fit and Fill','/#poster-editor']
 },
 'paper-size-and-orientation':{
  icon:'paper',keywords:['paper','a4','letter','us letter','a3','portrait','landscape','orientation','dimensions','inches','centimetres','units','size calculator'],takeaway:'Paper size is the individual sheet. Finished dimensions are the size of the assembled poster.',
  details:['The settings describe physical sheets, not an image preset. Do not select A3 just to make a larger poster if your printer can only print A4; use more A4 sheets instead.','Use the size calculator to compare the same exact finished canvas in each orientation. Keep margins, overlap and labels consistent for a fair comparison.','Exact dimensions can leave excess on the final row or column. Trim beyond the finished boundary after assembly; do not include excess paper in the poster measurement.','If you switch from A4 to Letter or rotate the paper, regenerate and check the layout. The printer’s automatic Fit setting can change the size of an otherwise correct PDF.'],
  visual:visual('/assets/homepage/print-margins.svg','A4 sheet with a labelled printable image area and 10 mm white margins','Paper-layout illustration. The 10 mm margin shown is an example, not a universal printer minimum.',0),
  related:['how-to-print-an-image-on-multiple-pages','how-to-print-a-pdf-at-actual-size','printer-margins-and-overlap'],tool:['Open the size calculator','/tools/poster-size-calculator']
 },
};
export const printProblems=[
 {title:'My print is the wrong size',description:'Check paper, 100% scale and the calibration lines.',slug:'how-to-print-a-pdf-at-actual-size',icon:'ruler'},
 {title:'White edges or large gaps',description:'Understand margins, overlap and panel spacing.',slug:'printer-margins-and-overlap',icon:'margins'},
 {title:'The sheets do not line up',description:'Check page order, trimming and repeated image edges.',slug:'how-to-assemble-a-tiled-poster',icon:'assembly'},
 {title:'My poster looks blurry',description:'Review source detail, PPI and optional enhancement.',slug:'image-resolution-for-large-posters',icon:'quality'},
];
export const printChecklist=[
 'Match paper and orientation in the PDF and printer.',
 'Use Actual Size / 100%. Turn off Fit to page and Shrink.',
 'Measure both 100 mm calibration lines on the print.',
 'Check that important content is inside the printable area.',
 'Review image detail and cropping at the finished size.',
 'Print an adjoining pair and check the overlap before the full job.',
 'Keep the assembly map and follow each page label.',
 'Trim joining edges, align the picture, then secure the poster.',
];
