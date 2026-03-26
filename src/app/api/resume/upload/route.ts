import { NextResponse } from "next/server";
import { parseResumeText, saveResumeFromText } from "@/lib/resume";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const save = formData.get("save") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    let text = "";

    // Handle PDF or text files
    if (file.name.endsWith(".pdf")) {
      // For PDF, we'll extract text using a simple approach
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      // Simple PDF text extraction (looks for text between stream markers)
      // This works for most text-based PDFs
      const pdfText = buffer.toString("utf-8", 0, buffer.length);
      
      // Extract readable text (filter out binary garbage)
      const textMatches = pdfText.match(/[\x20-\x7E\n\r\t]{20,}/g);
      text = textMatches ? textMatches.join(" ") : "";
      
      // Clean up common PDF artifacts
      text = text
        .replace(/\s+/g, " ")
        .replace(/[^\x20-\x7E\n]/g, " ")
        .trim();

      // If simple extraction fails, try alternative method
      if (text.length < 100) {
        // Look for text objects in PDF
        const textObjects = pdfText.match(/\(([^)]+)\)/g);
        if (textObjects) {
          text = textObjects
            .map(t => t.slice(1, -1))
            .filter(t => t.length > 2 && /[a-zA-Z]/.test(t))
            .join(" ");
        }
      }

      if (text.length < 50) {
        return NextResponse.json(
          { error: "Could not extract text from PDF. Try copy-pasting your resume text instead." },
          { status: 400 }
        );
      }
    } else if (file.name.endsWith(".txt")) {
      text = await file.text();
    } else {
      return NextResponse.json(
        { error: "Please upload a PDF or TXT file" },
        { status: 400 }
      );
    }

    // Parse resume text with LLM
    const parsed = await parseResumeText(text);

    // Save if requested
    if (save) {
      const resume = await saveResumeFromText(text);
      return NextResponse.json({
        saved: true,
        resume: {
          skills: resume.skills,
          experience: resume.experience,
          education: resume.education,
        },
        parsed,
      });
    }

    // Return preview
    return NextResponse.json({
      saved: false,
      text: text.slice(0, 500) + "...",
      parsed,
    });
  } catch (e: any) {
    console.error("Resume upload error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}