#!/usr/bin/env node
/**
 * Fix invalid URLs in the database
 * Corrects common typos like 'htts://' to 'https://'
 */

import { PrismaClient } from '@prisma/client';
import { sanitizeUrl } from '../src/utils/url-sanitizer.js';

const prisma = new PrismaClient();

async function fixInvalidUrls() {
  console.log('🔍 Searching for feeds with invalid URLs...');

  try {
    const feeds = await prisma.feed.findMany({
      select: { id: true, url: true, name: true },
    });

    let fixedCount = 0;

    for (const feed of feeds) {
      const sanitizedUrl = sanitizeUrl(feed.url);
      
      // Check if URL needs fixing
      if (sanitizedUrl && sanitizedUrl !== feed.url) {
        console.log(`📝 Fixing feed "${feed.name}" (${feed.id})`);
        console.log(`   Before: ${feed.url}`);
        console.log(`   After:  ${sanitizedUrl}`);

        await prisma.feed.update({
          where: { id: feed.id },
          data: { url: sanitizedUrl },
        });

        fixedCount++;
      }
    }

    console.log(`\n✅ Fixed ${fixedCount} feed(s) with invalid URLs`);

    if (fixedCount === 0) {
      console.log('✅ No invalid URLs found!');
    }
  } catch (error) {
    console.error('❌ Error fixing invalid URLs:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the fix
fixInvalidUrls();

