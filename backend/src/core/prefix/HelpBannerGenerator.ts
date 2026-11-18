import sharp from 'sharp';

export class HelpBannerGenerator {
  public static async generate(title: string, badgeText?: string | null): Promise<Buffer> {
    const width = 760;
    const height = 86;

    let badgeSvg = '';
    if (badgeText) {
      const pillWidth = 140;
      const pillHeight = 36;
      const pillX = width - pillWidth - 24;
      const pillY = (height - pillHeight) / 2;
      const textX = pillX + (pillWidth / 2);
      const textY = pillY + 23;

      badgeSvg = `
        <rect x="${pillX}" y="${pillY}" width="${pillWidth}" height="${pillHeight}" rx="18" ry="18" fill="#F4EDE8" />
        <text x="${textX}" y="${textY}" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="800" fill="#141519" text-anchor="middle">${badgeText}</text>
      `;
    }

    const cleanTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="${width - 4}" height="${height - 4}" rx="16" ry="16" fill="#15161A" stroke="#25272F" stroke-width="2"/>
      <text x="28" y="52" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="800" fill="#FFFFFF">${cleanTitle}</text>
      ${badgeSvg}
    </svg>
    `;

    return await sharp(Buffer.from(svg)).png().toBuffer();
  }
}

