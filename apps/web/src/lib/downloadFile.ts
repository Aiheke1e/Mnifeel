export default async function downloadFile(content: Blob | (() => Promise<Blob>), fileName: string) {
  const blob = typeof content === "function" ? await content() : content;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
