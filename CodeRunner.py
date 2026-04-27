#!/usr/bin/env python3
"""
PDF Report Generator — PHP CodeRunner
Requires: pip install reportlab Pillow
Usage:    python3 CodeRunner.py
"""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer,
    Table, TableStyle, Image, PageBreak, KeepTogether, Flowable,
    NextPageTemplate,
)

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────
SCREENSHOTS = {
    1: "/home/penguin/Pictures/Screenshots/Code/1.png",
    2: "/home/penguin/Pictures/Screenshots/Code/2.png",
    3: "/home/penguin/Pictures/Screenshots/Code/3.png",
}
OUTPUT_FILE = "CodeRunner_Report.pdf"

W, H      = A4
ML = MR   = 20 * mm   # left / right margin
MT        = 16 * mm   # top margin (below header)
MB        = 14 * mm   # bottom margin (above footer)
CONTENT_W = W - ML - MR

HEADER_H  = 11 * mm
FOOTER_H  =  9 * mm

# ─────────────────────────────────────────────────────────────────────────────
# PALETTE
# ─────────────────────────────────────────────────────────────────────────────
C_DARK    = colors.HexColor("#0f0f1a")   # near-black navy
C_PANEL   = colors.HexColor("#1e1e2e")   # dark panel
C_ACCENT  = colors.HexColor("#7c3aed")   # violet
C_ACCENT2 = colors.HexColor("#a78bfa")   # light violet
C_GREEN   = colors.HexColor("#10b981")   # emerald
C_AMBER   = colors.HexColor("#f59e0b")
C_BLUE    = colors.HexColor("#3b82f6")
C_RED     = colors.HexColor("#ef4444")
C_WHITE   = colors.white
C_OFF     = colors.HexColor("#f8f8f2")
C_MUTED   = colors.HexColor("#9ca3af")
C_BORDER  = colors.HexColor("#e5e7eb")
C_ROW     = colors.HexColor("#f5f3ff")
C_BLACK   = colors.HexColor("#111827")
C_COVER_SUB = colors.HexColor("#c4b5fd")

METHOD_COLOR = {
    "POST":  C_GREEN,
    "GET":   C_BLUE,
    "PATCH": C_AMBER,
    "PUT":   C_ACCENT,
    "DELETE": C_RED,
}


# ─────────────────────────────────────────────────────────────────────────────
# CUSTOM FLOWABLES
# ─────────────────────────────────────────────────────────────────────────────

class HRule(Flowable):
    """Full-width horizontal rule."""
    def __init__(self, color=C_BORDER, thickness=0.5, top=2*mm, bottom=2*mm):
        super().__init__()
        self.color = color; self.thickness = thickness
        self.top = top; self.bottom = bottom

    def wrap(self, aw, _):
        self._w = aw
        return aw, self.thickness + self.top + self.bottom

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, self.bottom, self._w, self.bottom)


class SectionBanner(Flowable):
    """Dark pill banner used as a section heading."""
    def __init__(self, number, title, h=12*mm):
        super().__init__()
        self.number = number
        self.title  = title
        self.bh     = h

    def wrap(self, aw, _):
        self._w = aw
        return aw, self.bh + 3*mm   # 3 mm bottom gap

    def draw(self):
        c = self.canv
        # background
        c.setFillColor(C_PANEL)
        c.roundRect(0, 3*mm, self._w, self.bh, 5, fill=1, stroke=0)
        # accent left bar
        c.setFillColor(C_ACCENT)
        c.roundRect(0, 3*mm, 4, self.bh, 2, fill=1, stroke=0)
        # number badge
        badge_w = 9*mm
        c.setFillColor(C_ACCENT)
        c.roundRect(6*mm, 3*mm + self.bh/2 - 4, badge_w, 8, 3, fill=1, stroke=0)
        c.setFillColor(C_WHITE)
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(6*mm + badge_w/2, 3*mm + self.bh/2 - 2.5, self.number)
        # title
        c.setFillColor(C_OFF)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(18*mm, 3*mm + self.bh/2 - 4, self.title)


class ImageFrame(Flowable):
    """Renders an image centred inside a rounded dark frame with a caption."""
    def __init__(self, path, caption, max_w=None, max_h=85*mm):
        super().__init__()
        self.path    = path
        self.caption = caption
        self.max_w   = max_w
        self.max_h   = max_h
        self._img    = None
        self._iw = self._ih = 0

    def _load(self, avail_w):
        mw = min(self.max_w or avail_w, avail_w)
        if os.path.exists(self.path):
            img = Image(self.path)
            iw, ih = img.imageWidth, img.imageHeight
            scale = min(mw / iw, self.max_h / ih, 1.0)
            self._iw = iw * scale
            self._ih = ih * scale
            self._img = img
        else:
            self._iw = mw
            self._ih = 20 * mm

    def wrap(self, aw, _):
        self._load(aw)
        pad = 6 * mm
        cap_h = 8 * mm
        self._aw = aw
        self._total_h = self._ih + pad * 2 + cap_h + 4 * mm
        return aw, self._total_h

    def draw(self):
        c    = self.canv
        pad  = 6 * mm
        cap_h = 8 * mm
        box_h = self._ih + pad * 2
        box_y = cap_h + 4 * mm

        # outer frame
        c.setFillColor(C_PANEL)
        c.setStrokeColor(C_ACCENT)
        c.setLineWidth(0.8)
        c.roundRect(0, box_y, self._aw, box_h, 6, fill=1, stroke=1)

        if self._img:
            x = (self._aw - self._iw) / 2
            y = box_y + pad
            c.drawImage(self.path, x, y, self._iw, self._ih,
                        preserveAspectRatio=True, mask="auto")
        else:
            c.setFillColor(C_MUTED)
            c.setFont("Helvetica-Oblique", 9)
            c.drawCentredString(self._aw / 2, box_y + box_h / 2,
                                f"[Image not found: {self.path}]")

        # caption
        c.setFillColor(C_MUTED)
        c.setFont("Helvetica-Oblique", 8)
        c.drawCentredString(self._aw / 2, 1.5 * mm, self.caption)


class TOCEntry(Flowable):
    """Single table-of-contents row with dot leader."""
    def __init__(self, number, title, page_hint):
        super().__init__()
        self.number     = number
        self.title      = title
        self.page_hint  = str(page_hint)

    def wrap(self, aw, _):
        self._w = aw
        return aw, 7 * mm

    def draw(self):
        c = self.canv
        y = 2 * mm
        # number
        c.setFillColor(C_ACCENT)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(0, y, self.number)
        # title
        c.setFillColor(C_BLACK)
        c.setFont("Helvetica", 9)
        c.drawString(10 * mm, y, self.title)
        # page
        c.setFillColor(C_MUTED)
        c.setFont("Helvetica", 9)
        c.drawRightString(self._w, y, self.page_hint)
        # dot leader
        title_end = 10 * mm + c.stringWidth(self.title, "Helvetica", 9) + 3 * mm
        page_start = self._w - c.stringWidth(self.page_hint, "Helvetica", 9) - 3 * mm
        c.setFillColor(C_BORDER)
        c.setFont("Helvetica", 9)
        dot_x = title_end
        while dot_x < page_start:
            c.drawString(dot_x, y, ".")
            dot_x += 3


# ─────────────────────────────────────────────────────────────────────────────
# STYLES
# ─────────────────────────────────────────────────────────────────────────────
def build_styles():
    def s(name, **kw):
        return ParagraphStyle(name, **kw)

    return {
        # cover
        "cover_title": s("cover_title",
            fontName="Helvetica-Bold", fontSize=34, textColor=C_ACCENT,
            alignment=TA_CENTER, leading=40, spaceAfter=0),
        "cover_sub": s("cover_sub",
            fontName="Helvetica", fontSize=13, textColor=C_BLACK,
            alignment=TA_CENTER, leading=18, spaceAfter=0),
        "cover_label": s("cover_label",
            fontName="Helvetica-Bold", fontSize=8, textColor=C_MUTED,
            alignment=TA_CENTER, spaceAfter=2, spaceBefore=0,
            letterSpacing=1.5),
        "cover_author": s("cover_author",
            fontName="Helvetica-Bold", fontSize=12, textColor=C_BLACK,
            alignment=TA_LEFT, leading=16),
        "cover_id": s("cover_id",
            fontName="Helvetica", fontSize=11, textColor=C_ACCENT,
            alignment=TA_RIGHT, leading=16),
        # body
        "body": s("body",
            fontName="Helvetica", fontSize=10, textColor=C_BLACK,
            leading=16, alignment=TA_JUSTIFY, spaceAfter=5),
        "body_left": s("body_left",
            fontName="Helvetica", fontSize=10, textColor=C_BLACK,
            leading=16, alignment=TA_LEFT, spaceAfter=5),
        "sub_heading": s("sub_heading",
            fontName="Helvetica-Bold", fontSize=11, textColor=C_ACCENT,
            spaceBefore=5, spaceAfter=3, leading=14),
        "bullet": s("bullet",
            fontName="Helvetica", fontSize=10, textColor=C_BLACK,
            leading=15, leftIndent=14, firstLineIndent=0, spaceAfter=3),
        "caption": s("caption",
            fontName="Helvetica-Oblique", fontSize=8.5, textColor=C_MUTED,
            alignment=TA_CENTER, spaceAfter=4),
        "toc_title": s("toc_title",
            fontName="Helvetica-Bold", fontSize=16, textColor=C_ACCENT,
            alignment=TA_LEFT, spaceAfter=4, spaceBefore=0),
        # table cells
        "th": s("th",
            fontName="Helvetica-Bold", fontSize=9, textColor=C_WHITE,
            alignment=TA_LEFT, leading=12),
        "td": s("td",
            fontName="Helvetica", fontSize=9, textColor=C_BLACK,
            alignment=TA_LEFT, leading=12),
        "td_mono": s("td_mono",
            fontName="Courier", fontSize=8.5, textColor=C_ACCENT,
            alignment=TA_LEFT, leading=12),
        "td_center": s("td_center",
            fontName="Helvetica", fontSize=9, textColor=C_BLACK,
            alignment=TA_CENTER, leading=12),
    }


# ─────────────────────────────────────────────────────────────────────────────
# TABLE HELPER
# ─────────────────────────────────────────────────────────────────────────────
BASE_TABLE_STYLE = [
    ("BACKGROUND",    (0, 0), (-1,  0), C_PANEL),
    ("TEXTCOLOR",     (0, 0), (-1,  0), C_WHITE),
    ("FONTNAME",      (0, 0), (-1,  0), "Helvetica-Bold"),
    ("FONTSIZE",      (0, 0), (-1, -1), 9),
    ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
    ("TEXTCOLOR",     (0, 1), (-1, -1), C_BLACK),
    ("ROWBACKGROUNDS",(0, 1), (-1, -1), [C_WHITE, C_ROW]),
    ("TOPPADDING",    (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ("LEFTPADDING",   (0, 0), (-1, -1), 8),
    ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
    ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ("BOX",           (0, 0), (-1, -1), 0.5, C_BORDER),
    ("LINEBELOW",     (0, 0), (-1,  0), 1.5, C_ACCENT),
    ("INNERGRID",     (0, 1), (-1, -1), 0.3, C_BORDER),
]

def make_table(rows, col_ratios, extra_style=None):
    col_w = [CONTENT_W * r for r in col_ratios]
    style = list(BASE_TABLE_STYLE)
    if extra_style:
        style.extend(extra_style)
    tbl = Table(rows, colWidths=col_w, repeatRows=1)
    tbl.setStyle(TableStyle(style))
    return tbl


# ─────────────────────────────────────────────────────────────────────────────
# PAGE TEMPLATES
# ─────────────────────────────────────────────────────────────────────────────
def draw_cover_bg(canvas, doc):
    """Clean white cover with a violet accent bar at the top and a thin bottom rule."""
    canvas.saveState()
    # white background
    canvas.setFillColor(C_WHITE)
    canvas.rect(0, 0, W, H, fill=1, stroke=0)
    # thick accent bar at top
    canvas.setFillColor(C_ACCENT)
    canvas.rect(0, H - 6 * mm, W, 6 * mm, fill=1, stroke=0)
    # thin accent rule at bottom
    canvas.setFillColor(C_ACCENT)
    canvas.rect(0, 0, W, 2, fill=1, stroke=0)
    canvas.restoreState()


def draw_inner_page(canvas, doc):
    canvas.saveState()
    # ── header ──
    canvas.setFillColor(C_PANEL)
    canvas.rect(0, H - HEADER_H, W, HEADER_H, fill=1, stroke=0)
    canvas.setFillColor(C_ACCENT)
    canvas.rect(0, H - HEADER_H, 3, HEADER_H, fill=1, stroke=0)
    canvas.setFillColor(C_ACCENT2)
    canvas.setFont("Helvetica-Bold", 8.5)
    canvas.drawString(ML, H - HEADER_H / 2 - 3, "PHP CodeRunner")
    canvas.setFillColor(C_MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(W - MR, H - HEADER_H / 2 - 3,
                           "Browser-Based PHP Execution Environment")
    # ── footer ──
    canvas.setFillColor(C_PANEL)
    canvas.rect(0, 0, W, FOOTER_H, fill=1, stroke=0)
    canvas.setFillColor(C_ACCENT)
    canvas.rect(0, FOOTER_H - 1.5, W, 1.5, fill=1, stroke=0)
    canvas.setFillColor(C_MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(ML, FOOTER_H / 2 - 3,
                      "Sinha Pranavkumar Shivkumar  ·  Jayshri")
    canvas.setFillColor(C_ACCENT2)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawRightString(W - MR, FOOTER_H / 2 - 3, f"Page  {doc.page - 1}")
    canvas.restoreState()


def build_doc_templates(doc):
    cover_frame = Frame(0, 0, W, H, leftPadding=ML, rightPadding=MR,
                        topPadding=H * 0.14, bottomPadding=30 * mm, id="cover")
    inner_frame = Frame(ML, MB + FOOTER_H, CONTENT_W,
                        H - MT - HEADER_H - MB - FOOTER_H,
                        leftPadding=0, rightPadding=0,
                        topPadding=0, bottomPadding=0, id="body")
    return [
        PageTemplate(id="Cover", frames=[cover_frame], onPage=draw_cover_bg),
        PageTemplate(id="Inner", frames=[inner_frame], onPage=draw_inner_page),
    ]


# ─────────────────────────────────────────────────────────────────────────────
# COVER PAGE
# ─────────────────────────────────────────────────────────────────────────────
def cover_page(styles):
    story = []

    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph("PHP CodeRunner", styles["cover_title"]))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("Browser-Based PHP Execution Environment", styles["cover_sub"]))
    story.append(Spacer(1, 10 * mm))

    # divider
    div = Table([[""]], colWidths=[CONTENT_W])
    div.setStyle(TableStyle([
        ("LINEABOVE",     (0, 0), (-1, 0), 1, C_ACCENT),
        ("TOPPADDING",    (0, 0), (-1, 0), 0),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 0),
    ]))
    story.append(div)
    story.append(Spacer(1, 10 * mm))

    story.append(Paragraph("DEVELOPED BY", styles["cover_label"]))
    story.append(Spacer(1, 4 * mm))

    authors = [
        [Paragraph("Sinha Pranavkumar Shivkumar", styles["cover_author"]),
         Paragraph("12501874", styles["cover_id"])],
        [Paragraph("Jayshri", styles["cover_author"]),
         Paragraph("12527994", styles["cover_id"])],
    ]
    atbl = Table(authors, colWidths=[CONTENT_W * 0.65, CONTENT_W * 0.35])
    atbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), colors.HexColor("#ffffff")),
        ("ROWBACKGROUNDS",(0, 0), (-1, -1), [colors.HexColor("#ffffff"),
                                              colors.HexColor("#f5f3ff")]),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("BOX",           (0, 0), (-1, -1), 0.5, C_ACCENT),
        ("LINEBELOW",     (0, 0), (-1,  0), 0.3, C_BORDER),
        ("LINEAFTER",     (0, 0), (0, -1),  0.3, C_BORDER),
    ]))
    story.append(atbl)
    story.append(Spacer(1, 12 * mm))

    # tag pills row
    tags = [["Monaco Editor", "Express.js", "Docker", "PHP 8.2", "Node.js"]]
    tag_w = CONTENT_W / 5
    ttbl = Table(tags, colWidths=[tag_w] * 5)
    ttbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_ACCENT),
        ("TEXTCOLOR",     (0, 0), (-1, -1), C_WHITE),
        ("FONTNAME",      (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, -1), 8),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("INNERGRID",     (0, 0), (-1, -1), 1, C_WHITE),
        ("BOX",           (0, 0), (-1, -1), 0, C_WHITE),
    ]))
    story.append(ttbl)
    story.append(Spacer(1, 10 * mm))

    story.append(Paragraph("April 2026", ParagraphStyle(
        "cdate", fontName="Helvetica", fontSize=9,
        textColor=C_MUTED, alignment=TA_CENTER)))

    story.append(NextPageTemplate("Inner"))
    story.append(PageBreak())
    return story


# ─────────────────────────────────────────────────────────────────────────────
# TABLE OF CONTENTS
# ─────────────────────────────────────────────────────────────────────────────
def toc_page(styles):
    story = []
    story.append(Paragraph("Contents", styles["toc_title"]))
    story.append(HRule(color=C_ACCENT, thickness=1.5, top=1*mm, bottom=4*mm))

    entries = [
        ("1", "Project Overview",        3),
        ("2", "Architecture & Flow",     3),
        ("3", "Security Model",          4),
        ("4", "API Reference",           4),
        ("5", "Project Structure",       5),
        ("6", "Application Screenshots", 6),
        ("7", "Running the Project",     7),
    ]
    for num, title, pg in entries:
        story.append(TOCEntry(num, title, pg))
        story.append(Spacer(1, 1 * mm))

    story.append(HRule(color=C_BORDER, thickness=0.5, top=3*mm, bottom=0))
    story.append(PageBreak())
    return story


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1 — OVERVIEW
# ─────────────────────────────────────────────────────────────────────────────
def section_overview(styles):
    story = []
    story.append(SectionBanner("1", "Project Overview"))
    story.append(Spacer(1, 4 * mm))

    story.append(Paragraph(
        "PHP CodeRunner is a browser-based IDE that lets users write and execute PHP code "
        "directly in their browser — no local PHP installation required. It pairs a "
        "Monaco-powered code editor (the same engine behind VS Code) with a sandboxed "
        "Docker execution backend, delivering instant PHP output in a live preview panel.",
        styles["body"]))

    story.append(Paragraph(
        "The application is composed of two independently deployable services, "
        "orchestrated by Docker Compose:",
        styles["body"]))

    bullets = [
        ("<b>Frontend</b> — A static single-page app served on port 3000. Provides the "
         "editor UI, file tabs, sidebar search, session management, and a live preview panel."),
        ("<b>Backend</b> — An Express.js REST API on port 3001. Handles session and file "
         "persistence on disk, and spawns ephemeral Docker containers to execute PHP code "
         "in a fully isolated environment."),
    ]
    for b in bullets:
        story.append(Paragraph(f"  •  {b}", styles["bullet"]))

    story.append(Spacer(1, 3 * mm))
    return story


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 2 — ARCHITECTURE
# ─────────────────────────────────────────────────────────────────────────────
def section_architecture(styles):
    story = []
    story.append(SectionBanner("2", "Architecture & How It Works"))
    story.append(Spacer(1, 4 * mm))

    story.append(Paragraph("Execution Flow", styles["sub_heading"]))
    story.append(Paragraph(
        "When a user clicks <b>Run</b>, the following sequence occurs end-to-end:",
        styles["body"]))

    steps = [
        ["#", "Step"],
        ["1", "Browser sends POST /api/run with the sessionId and entry filename."],
        ["2", "Backend validates the request and resolves the session workspace on disk."],
        ["3", "A temporary Docker container (php:8.2-cli-alpine) is spawned with the "
              "workspace mounted read-only."],
        ["4", "PHP executes the entry file inside the container — max 5 s, 64 MB RAM, "
              "0.5 CPU, no network access."],
        ["5", "stdout (HTML) is captured and returned to the browser as a JSON response."],
        ["6", "The container is destroyed immediately via the --rm flag."],
        ["7", "The frontend renders the HTML output inside an iframe preview panel."],
    ]
    tbl = make_table(steps, [0.06, 0.94], extra_style=[
        ("ALIGN",     (0, 0), (0, -1), "CENTER"),
        ("FONTNAME",  (0, 1), (0, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 1), (0, -1), C_ACCENT),
        ("FONTSIZE",  (0, 0), (0, -1), 10),
    ])
    story.append(tbl)
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph("Session & File Limits", styles["sub_heading"]))
    story.append(Paragraph(
        "Each project is a <i>session</i> — a UUID-named folder under "
        "<code>/workspaces/</code>. Files are stored as plain text on disk "
        "with the following enforced constraints:",
        styles["body"]))

    limits = [
        ["Constraint",              "Value"],
        ["Max file size",           "512 KB"],
        ["Max workspace size",      "5 MB"],
        ["Max files per session",   "50"],
        ["PHP execution timeout",   "5 seconds"],
        ["Container memory",        "64 MB"],
        ["Container CPUs",          "0.5"],
        ["Container PID limit",     "32"],
    ]
    tbl2 = make_table(limits, [0.60, 0.40], extra_style=[
        ("ALIGN",    (1, 0), (1, -1), "CENTER"),
        ("FONTNAME", (1, 1), (1, -1), "Helvetica-Bold"),
        ("TEXTCOLOR",(1, 1), (1, -1), C_ACCENT),
    ])
    story.append(tbl2)
    story.append(Spacer(1, 3 * mm))
    return story


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 3 — SECURITY
# ─────────────────────────────────────────────────────────────────────────────
def section_security(styles):
    story = []
    story.append(SectionBanner("3", "Security Model"))
    story.append(Spacer(1, 4 * mm))

    story.append(Paragraph(
        "Security is enforced at multiple independent layers to prevent abuse, "
        "path traversal, and container-escape attacks:",
        styles["body"]))

    rows = [
        ["Layer",                "Mechanism"],
        ["Filename validation",  "Strict allowlist regex — blocks path traversal (../) and special characters"],
        ["Container isolation",  "--network=none  ·  --cap-drop=ALL  ·  --security-opt=no-new-privileges"],
        ["Read-only filesystem", "--read-only mount with a small /tmp tmpfs (8 MB, noexec)"],
        ["Resource limits",      "64 MB RAM  ·  0.5 CPU  ·  32 PIDs  ·  5-second hard timeout"],
        ["Rate limiting",        "60 req / min general  ·  10 req / min for /api/run"],
        ["Ephemeral containers", "--rm flag destroys each container immediately after execution"],
    ]
    tbl = make_table(rows, [0.30, 0.70])
    story.append(tbl)
    story.append(Spacer(1, 3 * mm))
    return story


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 4 — API REFERENCE
# ─────────────────────────────────────────────────────────────────────────────
def section_api(styles):
    story = []
    story.append(SectionBanner("4", "API Reference"))
    story.append(Spacer(1, 4 * mm))

    endpoints = [
        ["Method", "Endpoint",                   "Description"],
        ["POST",   "/api/sessions",              "Create a new session (project)"],
        ["GET",    "/api/sessions?userId=",       "List all sessions for a user"],
        ["PATCH",  "/api/sessions/:id",           "Rename a session"],
        ["GET",    "/api/files?sessionId=",       "List files in a session"],
        ["GET",    "/api/files/:name?sessionId=", "Read a single file"],
        ["POST",   "/api/files",                  "Create a new file"],
        ["PUT",    "/api/files/:name",            "Save (overwrite) a file"],
        ["POST",   "/api/run",                    "Execute PHP — returns HTML output"],
        ["GET",    "/health",                     "Backend health check"],
    ]

    col_w = [CONTENT_W * r for r in [0.13, 0.40, 0.47]]
    style_cmds = list(BASE_TABLE_STYLE) + [
        ("ALIGN",    (0, 0), (0, -1), "CENTER"),
        ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (1, 1), (1, -1), "Courier"),
        ("TEXTCOLOR",(1, 1), (1, -1), C_ACCENT),
        ("FONTSIZE", (1, 1), (1, -1), 8.5),
    ]
    for i, row in enumerate(endpoints[1:], start=1):
        c = METHOD_COLOR.get(row[0], C_BLACK)
        style_cmds.append(("TEXTCOLOR", (0, i), (0, i), c))

    tbl = Table(endpoints, colWidths=col_w, repeatRows=1)
    tbl.setStyle(TableStyle(style_cmds))
    story.append(tbl)
    story.append(Spacer(1, 3 * mm))
    return story


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 5 — PROJECT STRUCTURE
# ─────────────────────────────────────────────────────────────────────────────
def section_structure(styles):
    story = []
    story.append(SectionBanner("5", "Project Structure"))
    story.append(Spacer(1, 4 * mm))

    # Group files by layer
    groups = [
        ("Frontend", [
            ("index.html",     "Editor UI — Monaco editor, layout, preview panel"),
            ("styles.css",     "UI stylesheet"),
            ("app.js",         "Frontend logic — editor, sessions, API calls"),
            ("server.js",      "Static file server (port 3000)"),
        ]),
        ("Infrastructure", [
            ("docker-compose.yml",         "Orchestrates frontend + backend services"),
            ("backend/Dockerfile",         "Backend container image definition"),
            ("Dockerfile",                 "Frontend container image definition"),
        ]),
        ("Backend — Core", [
            ("backend/src/index.js",       "Express app entry point"),
            ("backend/src/config.js",      "Centralised configuration & env vars"),
            ("backend/src/logger.js",      "Structured logging"),
        ]),
        ("Backend — Routes", [
            ("backend/src/routes/sessions.js", "Session CRUD endpoints"),
            ("backend/src/routes/files.js",    "File read / write endpoints"),
            ("backend/src/routes/run.js",      "PHP execution endpoint"),
        ]),
        ("Backend — Services", [
            ("backend/src/services/runner.js",    "Docker container spawn & timeout logic"),
            ("backend/src/services/workspace.js", "Filesystem operations & path validation"),
        ]),
        ("Backend — Middleware", [
            ("backend/src/middleware/errorHandler.js", "Centralised error responses"),
            ("backend/src/middleware/rateLimiter.js",  "Rate limiting middleware"),
        ]),
    ]

    rows = [["Path", "Layer", "Purpose"]]
    for layer, files in groups:
        for path, purpose in files:
            rows.append([path, layer, purpose])

    col_w = [CONTENT_W * r for r in [0.40, 0.20, 0.40]]
    style_cmds = list(BASE_TABLE_STYLE) + [
        ("FONTNAME",  (0, 1), (0, -1), "Courier"),
        ("TEXTCOLOR", (0, 1), (0, -1), C_ACCENT),
        ("FONTSIZE",  (0, 1), (0, -1), 8),
        ("ALIGN",     (1, 0), (1, -1), "CENTER"),
        ("FONTNAME",  (1, 1), (1, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (1, 1), (1, -1), C_MUTED),
        ("FONTSIZE",  (1, 0), (1, -1), 8),
    ]

    # shade each group differently
    layer_colors = [
        colors.HexColor("#ede9fe"),
        colors.HexColor("#ecfdf5"),
        colors.HexColor("#eff6ff"),
        colors.HexColor("#fef3c7"),
        colors.HexColor("#fce7f3"),
        colors.HexColor("#f0fdf4"),
    ]
    row_idx = 1
    for gi, (_, files) in enumerate(groups):
        bg = layer_colors[gi % len(layer_colors)]
        for _ in files:
            style_cmds.append(("BACKGROUND", (0, row_idx), (-1, row_idx), bg))
            row_idx += 1

    tbl = Table(rows, colWidths=col_w, repeatRows=1)
    tbl.setStyle(TableStyle(style_cmds))
    story.append(tbl)
    story.append(Spacer(1, 3 * mm))
    return story


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 6 — SCREENSHOTS
# ─────────────────────────────────────────────────────────────────────────────
def section_screenshots(styles):
    story = []
    story.append(SectionBanner("6", "Application Screenshots"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph("6.1  Basic PHP Compilation", styles["sub_heading"]))
    story.append(Paragraph(
        "A simple PHP script written in the Monaco editor with its rendered HTML output "
        "displayed in the live preview panel on the right. The editor provides syntax "
        "highlighting, auto-indentation, and VS Code-style keyboard shortcuts.",
        styles["body"]))
    story.append(Spacer(1, 2 * mm))
    story.append(ImageFrame(
        SCREENSHOTS[1],
        "Figure 1 — Basic PHP compilation: echo statements rendered as HTML output.",
        max_h=88 * mm,
    ))
    story.append(Spacer(1, 6 * mm))

    story.append(Paragraph("6.2  HTML, CSS & PHP Integration", styles["sub_heading"]))
    story.append(Paragraph(
        "A more advanced example — a PHP file that generates a fully styled HTML page "
        "using embedded CSS. This demonstrates the editor's multi-file tab support and "
        "the backend's ability to handle complex PHP output.",
        styles["body"]))
    story.append(Spacer(1, 2 * mm))
    story.append(ImageFrame(
        SCREENSHOTS[2],
        "Figure 2 — Advanced usage: HTML/CSS styled output generated by PHP.",
        max_h=88 * mm,
    ))

    story.append(PageBreak())

    story.append(Paragraph("6.3  Docker Compose Logs", styles["sub_heading"]))
    story.append(Paragraph(
        "The Docker Compose log output for the running stack. It shows the three "
        "service containers — <b>frontend</b>, <b>backend</b>, and <b>php-pull</b> — "
        "alongside startup messages, health-check pings, and per-request execution "
        "logs emitted by the backend service.",
        styles["body"]))
    story.append(Spacer(1, 2 * mm))
    story.append(ImageFrame(
        SCREENSHOTS[3],
        "Figure 3 — Docker Compose logs: container names, startup, and request activity.",
        max_h=105 * mm,
    ))
    story.append(Spacer(1, 3 * mm))
    return story


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 7 — RUNNING THE PROJECT
# ─────────────────────────────────────────────────────────────────────────────
def section_running(styles):
    story = []
    story.append(SectionBanner("7", "Running the Project"))
    story.append(Spacer(1, 4 * mm))

    story.append(Paragraph("Prerequisites", styles["sub_heading"]))
    for item in ["Docker  (v20 or later)", "Docker Compose  (v2 or later)"]:
        story.append(Paragraph(f"  •  {item}", styles["bullet"]))
    story.append(Spacer(1, 4 * mm))

    story.append(Paragraph("Start the stack", styles["sub_heading"]))

    cmd_rows = [["$ docker compose up"]]
    cmd_tbl = Table(cmd_rows, colWidths=[CONTENT_W])
    cmd_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_DARK),
        ("TEXTCOLOR",     (0, 0), (-1, -1), colors.HexColor("#50fa7b")),
        ("FONTNAME",      (0, 0), (-1, -1), "Courier-Bold"),
        ("FONTSIZE",      (0, 0), (-1, -1), 10),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING",   (0, 0), (-1, -1), 12),
        ("BOX",           (0, 0), (-1, -1), 1, C_ACCENT),
    ]))
    story.append(cmd_tbl)
    story.append(Spacer(1, 4 * mm))

    story.append(Paragraph(
        "Then open <b>http://localhost:3000</b> in your browser. "
        "The backend REST API is available at <b>http://localhost:3001</b>.",
        styles["body_left"]))
    story.append(Spacer(1, 4 * mm))

    story.append(Paragraph("Environment Variables", styles["sub_heading"]))
    story.append(Paragraph(
        "All values can be overridden in <code>.env</code> or directly in "
        "<code>docker-compose.yml</code>:",
        styles["body"]))

    env_rows = [
        ["Variable",                 "Default",            "Description"],
        ["PHP_IMAGE",                "php:8.2-cli-alpine", "PHP Docker image to use"],
        ["EXEC_TIMEOUT_MS",          "5000",               "Max PHP execution time (ms)"],
        ["CONTAINER_MEMORY",         "64m",                "Memory limit per container"],
        ["CONTAINER_CPUS",           "0.5",                "CPU limit per container"],
        ["CONTAINER_PIDS",           "32",                 "PID limit per container"],
        ["MAX_FILE_SIZE_BYTES",      "524288",             "Max file size (512 KB)"],
        ["MAX_WORKSPACE_SIZE_BYTES", "5242880",            "Max session size (5 MB)"],
        ["RUN_RATE_LIMIT_MAX",       "10",                 "Max Run requests per minute"],
        ["RATE_LIMIT_MAX",           "60",                 "Max general requests per minute"],
        ["LOG_LEVEL",                "info",               "Logging verbosity"],
    ]
    tbl = make_table(env_rows, [0.38, 0.24, 0.38], extra_style=[
        ("FONTNAME",  (0, 1), (0, -1), "Courier"),
        ("TEXTCOLOR", (0, 1), (0, -1), C_ACCENT),
        ("FONTSIZE",  (0, 1), (0, -1), 8.5),
        ("FONTNAME",  (1, 1), (1, -1), "Courier"),
        ("TEXTCOLOR", (1, 1), (1, -1), C_GREEN),
        ("FONTSIZE",  (1, 1), (1, -1), 8.5),
        ("ALIGN",     (1, 0), (1, -1), "CENTER"),
    ])
    story.append(tbl)
    story.append(Spacer(1, 3 * mm))
    return story


# ─────────────────────────────────────────────────────────────────────────────
# BUILD
# ─────────────────────────────────────────────────────────────────────────────
def build_pdf():
    doc = BaseDocTemplate(
        OUTPUT_FILE,
        pagesize=A4,
        title="PHP CodeRunner — Project Report",
        author="Sinha Pranavkumar Shivkumar & Jayshri",
        subject="Browser-Based PHP Execution Environment",
    )
    doc.addPageTemplates(build_doc_templates(doc))

    styles = build_styles()
    story  = []

    story += cover_page(styles)
    story += toc_page(styles)
    story += section_overview(styles)
    story.append(Spacer(1, 5 * mm))
    story += section_architecture(styles)
    story.append(Spacer(1, 5 * mm))
    story += section_security(styles)
    story.append(Spacer(1, 5 * mm))
    story += section_api(styles)
    story.append(Spacer(1, 5 * mm))
    story += section_structure(styles)
    story.append(PageBreak())
    story += section_screenshots(styles)
    story.append(Spacer(1, 5 * mm))
    story += section_running(styles)

    doc.build(story)
    print(f"✓  Report saved → {OUTPUT_FILE}")


if __name__ == "__main__":
    build_pdf()
