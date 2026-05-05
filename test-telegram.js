/**
 * Test script for Telegram Integration
 * Run this after setting up your .env file.
 * Usage: node test-telegram.js
 */

import 'dotenv/config';
import { sendTelegramMessage } from './src/services/telegramService.js';

const testMessage = `
🛠️ *DevMind Setup Check*
Your Telegram integration is working!

You will now receive real-time PR insights and weekly digests directly here.
`.trim();

console.log('--- DevMind Telegram Test ---');
console.log('Token:', process.env.TELEGRAM_BOT_TOKEN ? '✅ Found' : '❌ Missing');
console.log('Chat ID:', process.env.TELEGRAM_CHAT_ID ? '✅ Found' : '❌ Missing');

if (process.env.TELEGRAM_BOT_TOKEN) {
    console.log('Fetching latest Chat ID from Telegram...');
    fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates`)
        .then(r => r.json())
        .then(data => {
            if (data.ok && data.result.length > 0) {
                const chatId = data.result[data.result.length - 1].message.chat.id;
                console.log(`✅ Found Chat ID: ${chatId}`);
                console.log('Sending test message...');
                sendTelegramMessage(testMessage);
                console.log('\n🚀 ACTION REQUIRED:');
                console.log(`Please add "TELEGRAM_CHAT_ID=${chatId}" to your .env file!`);
            } else {
                console.log('❌ No messages found. Please send /start to your bot on Telegram first, then run this again.');
            }
        });
} else {
    console.log('Please configure your .env file with TELEGRAM_BOT_TOKEN first.');
}
