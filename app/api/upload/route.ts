import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const text = await file.text();

    return NextResponse.json({
      filename: file.name,
      size: file.size,
      status: "PARSED_SUCCESSFULLY",
      previewSnippet: text.substring(0, 200),
    });
  } catch (error: any) {
    return NextResponse.json({ error: "File parsing error" }, { status: 500 });
  }
}
