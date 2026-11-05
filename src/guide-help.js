export const guideHelp = {
  'how-to-make-a-block-poster': {
    mistakes: ['Choosing a small screenshot for a very large poster. Review the estimated PPI and print a representative sheet first.', 'Printing the entire PDF before checking paper, orientation and the calibration page.'],
    faq: [['Do I need a large-format printer?', 'Use a printer that supports the individual sheet size you selected. The larger poster is assembled from those sheets.'], ['Does making a poster upload my image?', 'The free tool reads and processes your image in your browser. It does not upload the image or require an account.']],
  },
  'how-to-print-an-image-on-multiple-pages': {
    mistakes: ['Counting the overlapping strips twice when measuring the finished poster.', 'Switching to a different paper size in the print dialog after creating the PDF.'],
    faq: [['Does a 2 by 2 layout mean four pages?', 'Yes. Poster pages are columns multiplied by rows. Calibration and assembly documents are separate downloads.'], ['Why is there white space on some sheets?', 'Fit keeps the whole image inside the canvas. Exact size can also leave unused space outside the finished canvas on the final row or column. Keep canvas whitespace and trim excess beyond the finished boundary.']],
  },
  'how-to-print-a-pdf-at-actual-size': {
    mistakes: ['Leaving Fit to page, Shrink or another automatic scaling option enabled.', 'Checking only the page count rather than measuring the printed calibration line.'],
    faq: [['My print dialog does not show Actual Size. What can I do?', 'Try a PDF reader with an explicit 100% or Actual Size option. Dialog wording varies; measure the calibration page before printing the poster.'], ['Will the tool correct my printer automatically?', 'No. The PDF has defined physical dimensions, but the printer and PDF reader control the printed scale. Use the calibration page to check your setup.']],
  },
  'how-to-assemble-a-tiled-poster': {
    mistakes: ['Mixing up rows and columns. Letters identify rows, and numbers identify columns.', 'Cutting away part of the picture needed for a join before checking the overlap and map.'],
    faq: [['Which sheet goes in the top-left corner?', 'A1. Use the assembly map for the other positions. A column-first export changes print order, while A1 still describes the same position.'], ['What changes when overlap is zero?', 'There is no repeated strip to align. Trim the white edges, join the image edges directly, and secure the back. Test an adjoining pair first.']],
  },
  'image-resolution-for-large-posters': {
    mistakes: ['Treating additional paper sheets as additional image detail.', 'Assuming that Fill increases resolution. It scales and crops the original image; the preview reports the resulting PPI.'],
    faq: [['Is one PPI value a guarantee of a sharp print?', 'No. Source quality, compression, print settings and viewing distance also affect the result. A representative test print is the useful final check.'], ['Does PosterTiler use AI to add detail?', 'The V1 tool does not call an AI service. To improve a soft result, use a better source or reduce the finished image size.']],
  },
};
