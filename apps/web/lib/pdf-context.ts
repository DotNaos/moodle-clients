export type PDFPageContext = {
  page: number;
  text: string;
  imageDataURL: string | null;
};

export type PDFViewState = {
  courseId: string | null;
  materialId: string;
  title: string;
  currentPage: number;
  pageCount: number;
  pages: PDFPageContext[];
};

export type PDFScrollCommand = {
  id: number;
  page: number;
};

export type CodexImageInput = {
  name: string;
  dataURL: string;
};

export function buildPDFPromptContext(pdf: PDFViewState | null) {
  if (!pdf) {
    return null;
  }

  return {
    title: pdf.title,
    materialId: pdf.materialId,
    courseId: pdf.courseId,
    currentPage: pdf.currentPage,
    pageCount: pdf.pageCount,
    currentPageText: pdf.pages.find((page) => page.page === pdf.currentPage)?.text ?? "",
    pages: pdf.pages.map((page) => ({
      page: page.page,
      hasImage: Boolean(page.imageDataURL),
      text: page.text,
    })),
  };
}

export function buildPDFImageInputs(pdf: PDFViewState | null): CodexImageInput[] {
  if (!pdf) {
    return [];
  }

  const current = pdf.pages.find((page) => page.page === pdf.currentPage);
  const orderedPages = [
    ...(current ? [current] : []),
    ...pdf.pages.filter((page) => page.page !== pdf.currentPage),
  ];

  return orderedPages
    .filter((page) => page.imageDataURL)
    .slice(0, 40)
    .map((page) => ({
      name: `pdf-page-${page.page}.jpg`,
      dataURL: page.imageDataURL as string,
    }));
}
