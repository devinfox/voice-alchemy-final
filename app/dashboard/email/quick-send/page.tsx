'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { Zap, Send, User, Mail, CheckCircle, AlertCircle, ArrowRight, ChevronDown, Megaphone, CreditCard, Pencil, Check, RotateCcw } from 'lucide-react'
import { EmailAccount } from '@/types/email.types'

interface EmailTemplate {
  id: string
  name: string
  description: string
  subject: string
  category: 'marketing' | 'payment'
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => string
}

interface TemplateCategory {
  id: string
  name: string
  icon: React.ComponentType<{ className?: string }>
  templates: EmailTemplate[]
}

// Permanent image URLs hosted on Supabase storage
const EMAIL_IMAGES = {
  logo: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/quick-send-logo.png',
  chart: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/quick-send-chart.png',
  guide: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/quick-send-guide.png',
  barChart: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/quick-send-bar-chart.png',
  // Annuity template images
  annuityChart: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/annuities-chart.png',
  annuityGuide: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/annuity-guide.png',
  // Bond template images
  bondChart: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/bonds-chart.png',
  bondGuide: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/bond-guide.png',
  // CD Guide template images (placeholder - update when assets ready)
  cdChart: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/quick-send-chart.png',
  cdGuide: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/quick-send-guide.png',
  // Gold vs Real Estate template images (placeholder - update when assets ready)
  realEstateChart: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/quick-send-bar-chart.png',
  realEstateGuide: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/quick-send-guide.png',
  // Gold vs Cash template images (placeholder - update when assets ready)
  cashChart: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/quick-send-chart.png',
  cashGuide: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/quick-send-guide.png',
  // Gold vs Stock Markets template images (placeholder - update when assets ready)
  stockChart: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/quick-send-chart.png',
  stockGuide: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/quick-send-guide.png',
  // Signature images
  sigLogo: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/citadel-logo-no-shadow-small.png',
  sigBbb: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/bb-rating.png',
  sigGoogle: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/google-G-logo.png',
  sigCheckmark: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/circle-checkmark.png',
  sigFoxNews: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/fox-news-logo.png',
  sigMarketWatch: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/market-watch-logo.png',
  // Check payment template
  checkSample: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/citadel-gold-check-template.jpg',
  // As Featured In template
  google5Star: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/google-5-star-reviews.png',
}

// Helper to format phone number for display (e.g., 3106949458 -> 310 694 9458)
const formatPhoneDisplay = (phone: string): string => {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
  }
  return phone
}

// Generate the email signature HTML
const generateSignatureHtml = (repName: string, repPhone: string, repEmail: string, repTitle: string = 'Precious Metals Specialist'): string => {
  const formattedPhone = formatPhoneDisplay(repPhone)
  return `
    <!-- Email Signature -->
    <table cellpadding="0" cellspacing="0" border="0" style="margin-top: 30px; border-collapse: collapse;">
      <tr>
        <td style="padding-right: 20px; vertical-align: top;">
          <!-- Left Column - Contact Info -->
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-family: Arial, sans-serif; font-size: 22px; font-weight: bold; color: #000; padding-bottom: 4px;">
                ${repName}
              </td>
            </tr>
            <tr>
              <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; padding-bottom: 12px;">
                ${repTitle}
              </td>
            </tr>
            <tr>
              <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; padding-bottom: 6px;">
                <span style="margin-right: 8px;">📞</span>${formattedPhone}
              </td>
            </tr>
            <tr>
              <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; padding-bottom: 6px;">
                <span style="margin-right: 8px;">✉️</span><a href="mailto:${repEmail}" style="color: #333; text-decoration: none;">${repEmail}</a>
              </td>
            </tr>
            <tr>
              <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
                <span style="margin-right: 8px;">🌐</span><a href="https://www.voicealchemyacademy.com" style="color: #333; text-decoration: none;">www.voicealchemyacademy.com</a>
              </td>
            </tr>
          </table>
        </td>
        <td style="vertical-align: top; padding-left: 20px;">
          <!-- Right Column - Logo -->
          <img src="${EMAIL_IMAGES.sigLogo}" alt="Voice Alchemy Academy" style="height: 80px; width: auto;">
        </td>
      </tr>
    </table>

    <!-- Divider -->
    <div style="border-top: 2px solid #c9a227; margin: 25px 0 20px 0; max-width: 500px;"></div>

    <!-- Trust Badges Section -->
    <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
      <tr>
        <td style="vertical-align: top; padding-right: 60px;">
          <!-- Trusted by Investors -->
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; color: #000; padding-bottom: 15px;">
                Trusted by Investors Nationwide:
              </td>
            </tr>
            <tr>
              <td style="padding-bottom: 10px;">
                <table cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align: middle; padding-right: 10px;">
                      <img src="${EMAIL_IMAGES.sigBbb}" alt="BBB A Rating" style="height: 36px; width: auto;">
                    </td>
                    <td style="vertical-align: middle; font-family: Arial, sans-serif; font-size: 13px; color: #333;">
                      <strong>A</strong> Grade with BBB
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom: 10px;">
                <table cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align: middle; padding-right: 10px;">
                      <img src="${EMAIL_IMAGES.sigGoogle}" alt="Google Reviews" style="height: 28px; width: auto;">
                    </td>
                    <td style="vertical-align: middle; font-family: Arial, sans-serif; font-size: 13px; color: #333;">
                      5-Star Google Reviews
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td>
                <table cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align: middle; padding-right: 10px;">
                      <img src="${EMAIL_IMAGES.sigCheckmark}" alt="NCBA Member" style="height: 28px; width: auto;">
                    </td>
                    <td style="vertical-align: middle; font-family: Arial, sans-serif; font-size: 13px; color: #333;">
                      Members - National Coin<br>& Bullion Association
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
        <td style="vertical-align: top;">
          <!-- As Seen On -->
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; color: #000; padding-bottom: 15px;">
                As Seen On
              </td>
            </tr>
            <tr>
              <td style="padding-bottom: 12px;">
                <img src="${EMAIL_IMAGES.sigFoxNews}" alt="Fox News" style="height: 50px; width: auto;">
              </td>
            </tr>
            <tr>
              <td>
                <img src="${EMAIL_IMAGES.sigMarketWatch}" alt="MarketWatch" style="height: 24px; width: auto;">
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `
}

// Cash vs Gold email template
const cashEmailTemplate: EmailTemplate = {
  id: 'cash-email',
  name: 'Cash vs Gold',
  description: 'For prospects who invest in cash but not gold',
  subject: 'Quick follow-up on our conversation about protecting your savings',
  category: 'marketing',
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', Times, serif; background-color: #f5f5f5;">
  <!-- Preheader -->
  <div style="font-size: 12px; text-align: center; padding: 12px 20px; background-color: #3d4a3a; color: #ccc;">
    Thank you for considering Voice Alchemy Academy for your gold and silver needs. If you're no longer interested in our content, please use the unsubscribe button at the bottom of the page.
  </div>

  <!-- Header with Logo -->
  <div style="background-color: #3d4a3a; padding: 20px 20px 25px; text-align: center; border-bottom: 3px solid #d4af37;">
    <img src="${EMAIL_IMAGES.logo}" alt="Voice Alchemy Academy" style="height: 80px; margin-bottom: 12px;">
    <div style="color: #fff; font-size: 14px;">
      800-605-5597 | <a href="https://www.voicealchemyacademy.com" style="color: #d4af37; text-decoration: underline;">voicealchemyacademy.com</a>
    </div>
  </div>

  <!-- Main Content -->
  <div style="background-color: #ffffff; padding: 40px 30px; max-width: 600px; margin: 0 auto;">
    <!-- Title -->
    <h1 style="text-align: center; margin: 0 0 5px 0; font-size: 28px; font-weight: normal;">
      <span style="color: #c9a227;">Gold vs</span> <span style="color: #333;">The Dollar,</span>
    </h1>
    <h2 style="text-align: center; margin: 0 0 10px 0; font-size: 24px; font-weight: normal; color: #333;">
      Which has Performed Better?
    </h2>
    <p style="text-align: center; margin: 0 0 25px 0; font-size: 16px; color: #666;">
      Gold vs. The Dollar: <span style="color: #c9a227;">The Shocking 20-Year Comparison</span>
    </p>

    <!-- Chart Image -->
    <div style="text-align: center; margin-bottom: 30px;">
      <img src="${EMAIL_IMAGES.chart}" alt="Gold vs U.S. Dollar Purchasing Power (2006-2026)" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
    </div>

    <!-- Personal Message -->
    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Hi ${firstName},
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      It was great chatting with you earlier about your retirement savings and the cash you're currently holding. I wanted to actually give you something visual that helps put that into perspective.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Above is a simple comparison showing how cash has performed versus physical gold over the past 25 years.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      What surprises many people is that while cash doesn't fluctuate, its purchasing power steadily declines over time due to inflation. Gold, on the other hand, has historically been used as a store of value during economic uncertainty and rising costs.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      This isn't about replacing everything — it's about protecting and diversifying a portion of what you've worked hard to build.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      I also attached our full Precious Metals Investment Guide in case you'd like to explore the topic in more detail. When you've had a chance to look things over, I'm happy to answer any questions.
    </p>

    <!-- Download Guide CTA - Above signature -->
    <div style="margin: 30px 0; text-align: center;">
      <a href="https://www.voicealchemyacademy.com/thank-you" style="display: inline-block; text-decoration: none;">
        <img src="${EMAIL_IMAGES.guide}" alt="Download Our Investment Guide" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
      </a>
    </div>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 5px;">
      Talk soon,
    </p>

    ${generateSignatureHtml(repName, repPhone, repEmail)}
  </div>

  <!-- Footer -->
  <div style="background-color: #f0f0f0; padding: 25px 20px; text-align: center; font-size: 12px; color: #666;">
    <p style="margin: 0 0 10px 0;">
      Voice Alchemy Academy | 2029 Century Park E #400N | Los Angeles, CA 90067
    </p>
    <p style="margin: 0;">
      <a href="#" style="color: #666; text-decoration: underline;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>
`
  }
}

// Precious Metals vs Other Assets email template
const metalsComparisonTemplate: EmailTemplate = {
  id: 'metals-comparison',
  name: 'Precious Metals Guide',
  description: 'For prospects interested in gold and precious metals',
  subject: 'Quick follow-up: Precious metals performance comparison',
  category: 'marketing',
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', Times, serif; background-color: #f5f5f5;">
  <!-- Preheader -->
  <div style="font-size: 12px; text-align: center; padding: 12px 20px; background-color: #3d4a3a; color: #ccc;">
    Thank you for considering Voice Alchemy Academy for your gold and silver needs. If you're no longer interested in our content, please use the unsubscribe button at the bottom of the page.
  </div>

  <!-- Header with Logo -->
  <div style="background-color: #3d4a3a; padding: 20px 20px 25px; text-align: center; border-bottom: 3px solid #d4af37;">
    <img src="${EMAIL_IMAGES.logo}" alt="Voice Alchemy Academy" style="height: 80px; margin-bottom: 12px;">
    <div style="color: #fff; font-size: 14px;">
      800-605-5597 | <a href="https://www.voicealchemyacademy.com" style="color: #d4af37; text-decoration: underline;">voicealchemyacademy.com</a>
    </div>
  </div>

  <!-- Main Content -->
  <div style="background-color: #ffffff; padding: 40px 30px; max-width: 600px; margin: 0 auto;">
    <!-- Title -->
    <h1 style="text-align: center; margin: 0 0 5px 0; font-size: 28px; font-weight: normal;">
      <span style="color: #c9a227;">Precious Metals</span> <span style="color: #333;">vs</span>
    </h1>
    <h2 style="text-align: center; margin: 0 0 10px 0; font-size: 24px; font-weight: normal; color: #333;">
      Traditional Investments
    </h2>
    <p style="text-align: center; margin: 0 0 25px 0; font-size: 16px; color: #666;">
      A <span style="color: #c9a227;">20-Year Performance Comparison</span>
    </p>

    <!-- Personal Message -->
    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Hi ${firstName},
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      It was great chatting with you earlier about your interest in gold and precious metals. I wanted to actually share a quick visual that shows how metals have performed compared to traditional investments.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Below is a comparison of precious metals versus other major asset classes over the past 20 years:
    </p>

    <!-- Chart Image -->
    <div style="text-align: center; margin-bottom: 30px;">
      <img src="${EMAIL_IMAGES.barChart}" alt="Precious Metals vs Other Asset Classes (20 Year Comparison)" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
    </div>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Many investors use metals not for speculation, but for stability and diversification. Historically, gold has often moved independently from the stock market, which can help balance risk in a broader portfolio.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      I've also attached our full Precious Metals Investment Guide so you can review everything at your own pace. Once you've had a chance to look it over, I'm happy to talk through what might make sense based on your goals.
    </p>

    <!-- Download Guide CTA - Above signature -->
    <div style="margin: 30px 0; text-align: center;">
      <a href="https://www.voicealchemyacademy.com/thank-you" style="display: inline-block; text-decoration: none;">
        <img src="${EMAIL_IMAGES.guide}" alt="Download Our Investment Guide" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
      </a>
    </div>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 5px;">
      Looking forward to continuing the conversation,
    </p>

    ${generateSignatureHtml(repName, repPhone, repEmail)}
  </div>

  <!-- Footer -->
  <div style="background-color: #f0f0f0; padding: 25px 20px; text-align: center; font-size: 12px; color: #666;">
    <p style="margin: 0 0 10px 0;">
      Voice Alchemy Academy | 2029 Century Park E #400N | Los Angeles, CA 90067
    </p>
    <p style="margin: 0;">
      <a href="#" style="color: #666; text-decoration: underline;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>
`
  }
}

// Wire Transfer Instructions email template
const wireTransferTemplate: EmailTemplate = {
  id: 'wire-transfer',
  name: 'Wire Transfer Instructions',
  description: 'Send wire transfer details to complete a purchase',
  subject: 'Wire Transfer Instructions - Voice Alchemy Academy',
  category: 'payment',
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', Times, serif; background-color: #f5f5f5;">
  <!-- Preheader -->
  <div style="font-size: 12px; text-align: center; padding: 12px 20px; background-color: #3d4a3a; color: #ccc;">
    Wire Transfer Instructions for your Voice Alchemy Academy purchase. Please keep this information secure.
  </div>

  <!-- Header with Logo -->
  <div style="background-color: #3d4a3a; padding: 20px 20px 25px; text-align: center; border-bottom: 3px solid #d4af37;">
    <img src="${EMAIL_IMAGES.logo}" alt="Voice Alchemy Academy" style="height: 80px; margin-bottom: 12px;">
    <div style="color: #fff; font-size: 14px;">
      800-605-5597 | <a href="https://www.voicealchemyacademy.com" style="color: #d4af37; text-decoration: underline;">voicealchemyacademy.com</a>
    </div>
  </div>

  <!-- Main Content -->
  <div style="background-color: #ffffff; padding: 40px 30px; max-width: 700px; margin: 0 auto;">
    <!-- Title -->
    <h1 style="text-align: center; margin: 0 0 30px 0; font-size: 28px; font-weight: normal; color: #333;">
      <span style="color: #c9a227;">Wire Transfer</span> Instructions
    </h1>

    <!-- Personal Message -->
    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Dear ${firstName},
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Thank you for choosing Voice Alchemy Academy for your Precious Metals Investment. Below are the wire transfer details to complete your purchase. Please provide these instructions to your bank to ensure accurate and timely processing of your funds.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 25px;">
      Voice Alchemy Academy, LLC bank accounts are held with <strong>Wells Fargo Bank, N.A.</strong> To initiate the wire transfer, please provide your sending bank with the information below to ensure accurate and prompt processing.
    </p>

    <!-- Wire Transfer Information Table -->
    <div style="background-color: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px; padding: 25px; margin-bottom: 30px;">
      <h2 style="margin: 0 0 20px 0; font-size: 20px; color: #333; border-bottom: 2px solid #c9a227; padding-bottom: 10px;">
        Wire Transfer Information
      </h2>

      <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif;">
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 12px 10px; font-weight: bold; color: #555; width: 40%; vertical-align: top;">Bank Name:</td>
          <td style="padding: 12px 10px; color: #333;">Wells Fargo Bank</td>
        </tr>
        <tr style="border-bottom: 1px solid #e0e0e0; background-color: #fff;">
          <td style="padding: 12px 10px; font-weight: bold; color: #555; vertical-align: top;">Bank Address:</td>
          <td style="padding: 12px 10px; color: #333;">420 Montgomery St.<br>San Francisco, CA, 94104</td>
        </tr>
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 12px 10px; font-weight: bold; color: #555; vertical-align: top;">Bank Phone Number:</td>
          <td style="padding: 12px 10px; color: #333;">(888) 384-8400</td>
        </tr>
        <tr style="border-bottom: 1px solid #e0e0e0; background-color: #fff;">
          <td style="padding: 12px 10px; font-weight: bold; color: #555; vertical-align: top;">ABA/Routing Number:</td>
          <td style="padding: 12px 10px; color: #333; font-weight: bold; font-size: 17px;">121000248</td>
        </tr>
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 12px 10px; font-weight: bold; color: #555; vertical-align: top;">Account Name:</td>
          <td style="padding: 12px 10px; color: #333; font-weight: bold;">Voice Alchemy Academy LLC</td>
        </tr>
        <tr style="border-bottom: 1px solid #e0e0e0; background-color: #fff;">
          <td style="padding: 12px 10px; font-weight: bold; color: #555; vertical-align: top;">Account Number:</td>
          <td style="padding: 12px 10px; color: #333; font-weight: bold; font-size: 17px;">7290256846</td>
        </tr>
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 12px 10px; font-weight: bold; color: #555; vertical-align: top;">Account Address:</td>
          <td style="padding: 12px 10px; color: #333;">2029 Century Park E #400N<br>Los Angeles, CA, 90067</td>
        </tr>
        <tr style="border-bottom: 1px solid #e0e0e0; background-color: #fff;">
          <td style="padding: 12px 10px; font-weight: bold; color: #555; vertical-align: top;">Phone:</td>
          <td style="padding: 12px 10px; color: #333;">(310)-209-8166</td>
        </tr>
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 12px 10px; font-weight: bold; color: #555; vertical-align: top;">Website:</td>
          <td style="padding: 12px 10px; color: #333;"><a href="https://www.voicealchemyacademy.com" style="color: #c9a227;">www.voicealchemyacademy.com</a></td>
        </tr>
        <tr style="border-bottom: 1px solid #e0e0e0; background-color: #fff;">
          <td style="padding: 12px 10px; font-weight: bold; color: #555; vertical-align: top;">SWIFT Code:</td>
          <td style="padding: 12px 10px; color: #333; font-weight: bold;">WFIBUS6S</td>
        </tr>
      </table>

      <!-- Download Button -->
      <div style="text-align: center; margin-top: 25px;">
        <a href="https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/wire-transfer/2026-Wire-Transfer-Instructions.pdf" download style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #d4af37 0%, #f4d03f 50%, #d4af37 100%); color: #000; font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.4);">
          Download Wiring Information
        </a>
      </div>
    </div>

    <!-- Important Notice -->
    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      <strong>Please ensure all details are correctly entered to avoid processing delays.</strong> If you need assistance, don't hesitate to reach out to your broker directly or contact us at <strong>(310)-209-8166</strong> or <a href="mailto:IRA@voicealchemyacademy.com" style="color: #c9a227;">IRA@voicealchemyacademy.com</a>.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 25px;">
      We appreciate your business and look forward to finalizing your transaction.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 5px;">
      Sincerely,
    </p>

    ${generateSignatureHtml(repName, repPhone, repEmail)}
  </div>

  <!-- Footer -->
  <div style="background-color: #f0f0f0; padding: 25px 20px; text-align: center; font-size: 12px; color: #666;">
    <p style="margin: 0 0 10px 0;">
      Voice Alchemy Academy | 2029 Century Park E #400N | Los Angeles, CA 90067
    </p>
    <p style="margin: 0;">
      <a href="#" style="color: #666; text-decoration: underline;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>
`
  }
}

// Check Payment Instructions email template
const checkPaymentTemplate: EmailTemplate = {
  id: 'check-payment',
  name: 'Check Payment Instructions',
  description: 'Send check payment details to complete a purchase',
  subject: 'Check Payment Instructions - Voice Alchemy Academy',
  category: 'payment',
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', Times, serif; background-color: #f5f5f5;">
  <!-- Preheader -->
  <div style="font-size: 12px; text-align: center; padding: 12px 20px; background-color: #3d4a3a; color: #ccc;">
    Check Payment Instructions for your Voice Alchemy Academy purchase. Please keep this information secure.
  </div>

  <!-- Header with Logo -->
  <div style="background-color: #3d4a3a; padding: 20px 20px 25px; text-align: center; border-bottom: 3px solid #d4af37;">
    <img src="${EMAIL_IMAGES.logo}" alt="Voice Alchemy Academy" style="height: 80px; margin-bottom: 12px;">
    <div style="color: #fff; font-size: 14px;">
      800-605-5597 | <a href="https://www.voicealchemyacademy.com" style="color: #d4af37; text-decoration: underline;">voicealchemyacademy.com</a>
    </div>
  </div>

  <!-- Main Content -->
  <div style="background-color: #ffffff; padding: 40px 30px; max-width: 700px; margin: 0 auto;">
    <!-- Title -->
    <h1 style="text-align: center; margin: 0 0 30px 0; font-size: 28px; font-weight: normal; color: #333;">
      <span style="color: #c9a227;">Check Payment</span> Instructions
    </h1>

    <!-- Personal Message -->
    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Dear ${firstName},
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Thank you for choosing Voice Alchemy Academy for your Precious Metals Investment. To complete your purchase via physical check, please follow the instructions below to ensure your payment is processed accurately and your order is finalized promptly.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 25px;">
      Voice Alchemy Academy, LLC accepts personal, cashier's, and business checks. Please note that orders paid by check may be subject to a holding period (typically 5–10 business days) for funds to clear before your metals are released for shipment.
    </p>

    <!-- Check Payment Information Section -->
    <div style="background-color: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px; padding: 25px; margin-bottom: 30px;">
      <h2 style="margin: 0 0 20px 0; font-size: 20px; color: #333; border-bottom: 2px solid #c9a227; padding-bottom: 10px;">
        Check Payment Information
      </h2>

      <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
        Please make your check payable to <strong>Voice Alchemy Academy</strong>, as shown in the example below:
      </p>

      <!-- Check Sample Image -->
      <div style="text-align: center; margin: 20px 0;">
        <img src="${EMAIL_IMAGES.checkSample}" alt="Check Sample - Make payable to Voice Alchemy Academy" style="width: 100%; max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
      </div>
    </div>

    <!-- Assistance Notice -->
    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      If you need further assistance or have questions regarding the mailing process, please reach out to your broker directly or contact us at <strong>(310) 209-8166</strong>.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 25px;">
      We appreciate your business and look forward to finalizing your transaction.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 5px;">
      Sincerely,
    </p>

    ${generateSignatureHtml(repName, repPhone, repEmail)}
  </div>

  <!-- Footer -->
  <div style="background-color: #f0f0f0; padding: 25px 20px; text-align: center; font-size: 12px; color: #666;">
    <p style="margin: 0 0 10px 0;">
      Voice Alchemy Academy | 2029 Century Park E #400N | Los Angeles, CA 90067
    </p>
    <p style="margin: 0;">
      <a href="#" style="color: #666; text-decoration: underline;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>
`
  }
}

// Order Confirmation / Processing Timeline email template
const orderConfirmationTemplate: EmailTemplate = {
  id: 'order-confirmation',
  name: 'Order Confirmation',
  description: 'Confirm paperwork received and explain processing timeline',
  subject: 'Your Order is Being Processed - Voice Alchemy Academy',
  category: 'payment',
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', Times, serif; background-color: #f5f5f5;">
  <!-- Preheader -->
  <div style="font-size: 12px; text-align: center; padding: 12px 20px; background-color: #3d4a3a; color: #ccc;">
    Your order is confirmed and being processed. Here's exactly what happens next.
  </div>

  <!-- Header with Logo -->
  <div style="background-color: #3d4a3a; padding: 20px 20px 25px; text-align: center; border-bottom: 3px solid #d4af37;">
    <img src="${EMAIL_IMAGES.logo}" alt="Voice Alchemy Academy" style="height: 80px; margin-bottom: 12px;">
    <div style="color: #fff; font-size: 14px;">
      800-605-5597 | <a href="https://www.voicealchemyacademy.com" style="color: #d4af37; text-decoration: underline;">voicealchemyacademy.com</a>
    </div>
  </div>

  <!-- Main Content -->
  <div style="background-color: #ffffff; padding: 40px 30px; max-width: 700px; margin: 0 auto;">
    <!-- Title -->
    <h1 style="text-align: center; margin: 0 0 10px 0; font-size: 28px; font-weight: normal; color: #333;">
      <span style="color: #c9a227;">Congratulations!</span>
    </h1>
    <h2 style="text-align: center; margin: 0 0 30px 0; font-size: 22px; font-weight: normal; color: #333;">
      Your Order Has Been Received
    </h2>

    <!-- Personal Message -->
    <p style="font-size: 17px; color: #333; line-height: 1.8; margin-bottom: 20px;">
      Dear ${firstName},
    </p>

    <p style="font-size: 17px; color: #333; line-height: 1.8; margin-bottom: 20px;">
      <strong>Congratulations</strong> on taking an important step toward strengthening and diversifying your financial future.
    </p>

    <p style="font-size: 17px; color: #333; line-height: 1.8; margin-bottom: 30px;">
      Your paperwork and payment have been successfully received by Voice Alchemy Academy. Our team is now preparing your order.
    </p>

    <!-- What Happens Next Header -->
    <div style="background-color: #3d4a3a; color: #fff; padding: 15px 20px; border-radius: 8px 8px 0 0; text-align: center;">
      <h2 style="margin: 0; font-size: 20px; font-weight: normal;">
        Here's Exactly What Happens Next
      </h2>
    </div>

    <!-- Steps Container -->
    <div style="border: 2px solid #3d4a3a; border-top: none; border-radius: 0 0 8px 8px; overflow: hidden;">

      <!-- Step 1 -->
      <div style="padding: 25px; border-bottom: 1px solid #e0e0e0; background-color: #fafafa;">
        <table cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
          <tr>
            <td style="width: 60px; vertical-align: top;">
              <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #c9a227 0%, #d4af37 100%); border-radius: 50%; text-align: center; line-height: 50px; font-size: 24px; font-weight: bold; color: #fff;">
                1
              </div>
            </td>
            <td style="vertical-align: top;">
              <h3 style="margin: 0 0 10px 0; font-size: 18px; color: #333;">Payment Processing</h3>
              <p style="margin: 0 0 12px 0; font-size: 16px; color: #555; line-height: 1.6;">
                Your payment must first complete processing.
              </p>
              <table cellpadding="0" cellspacing="0" border="0" style="font-size: 15px; color: #555;">
                <tr>
                  <td style="padding: 6px 0; padding-right: 15px;">✓ <strong>Wire transfers:</strong></td>
                  <td style="padding: 6px 0;">1 business day</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; padding-right: 15px;">✓ <strong>Checks:</strong></td>
                  <td style="padding: 6px 0;">5–7 business days to clear</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>

      <!-- Step 2 -->
      <div style="padding: 25px; border-bottom: 1px solid #e0e0e0; background-color: #fff;">
        <table cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
          <tr>
            <td style="width: 60px; vertical-align: top;">
              <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #c9a227 0%, #d4af37 100%); border-radius: 50%; text-align: center; line-height: 50px; font-size: 24px; font-weight: bold; color: #fff;">
                2
              </div>
            </td>
            <td style="vertical-align: top;">
              <h3 style="margin: 0 0 10px 0; font-size: 18px; color: #333;">Quality Control & Order Preparation</h3>
              <p style="margin: 0; font-size: 16px; color: #555; line-height: 1.6;">
                Your metals are retrieved from secure storage and inspected by our team to ensure proper quality and order accuracy.
              </p>
              <p style="margin: 12px 0 0 0; font-size: 15px; color: #777;">
                <strong>Timeframe:</strong> 5–7 business days
              </p>
            </td>
          </tr>
        </table>
      </div>

      <!-- Step 3 -->
      <div style="padding: 25px; border-bottom: 1px solid #e0e0e0; background-color: #fafafa;">
        <table cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
          <tr>
            <td style="width: 60px; vertical-align: top;">
              <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #c9a227 0%, #d4af37 100%); border-radius: 50%; text-align: center; line-height: 50px; font-size: 24px; font-weight: bold; color: #fff;">
                3
              </div>
            </td>
            <td style="vertical-align: top;">
              <h3 style="margin: 0 0 10px 0; font-size: 18px; color: #333;">Shipping Carrier Assignment</h3>
              <p style="margin: 0; font-size: 16px; color: #555; line-height: 1.6;">
                Once your metals pass inspection, a secure shipping carrier is assigned to your order.
              </p>
              <p style="margin: 12px 0 0 0; font-size: 15px; color: #777;">
                You will receive shipment confirmation when this is complete.
              </p>
            </td>
          </tr>
        </table>
      </div>

      <!-- Step 4 -->
      <div style="padding: 25px; border-bottom: 1px solid #e0e0e0; background-color: #fff;">
        <table cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
          <tr>
            <td style="width: 60px; vertical-align: top;">
              <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #c9a227 0%, #d4af37 100%); border-radius: 50%; text-align: center; line-height: 50px; font-size: 24px; font-weight: bold; color: #fff;">
                4
              </div>
            </td>
            <td style="vertical-align: top;">
              <h3 style="margin: 0 0 10px 0; font-size: 18px; color: #333;">Order Shipment</h3>
              <p style="margin: 0; font-size: 16px; color: #555; line-height: 1.6;">
                Your metals are professionally packaged and shipped via secure carrier.
              </p>
              <p style="margin: 12px 0 0 0; font-size: 15px; color: #777;">
                Tracking information will be provided when your order leaves our facility.
              </p>
            </td>
          </tr>
        </table>
      </div>

      <!-- Step 5 -->
      <div style="padding: 25px; background-color: #fafafa;">
        <table cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
          <tr>
            <td style="width: 60px; vertical-align: top;">
              <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #c9a227 0%, #d4af37 100%); border-radius: 50%; text-align: center; line-height: 50px; font-size: 24px; font-weight: bold; color: #fff;">
                5
              </div>
            </td>
            <td style="vertical-align: top;">
              <h3 style="margin: 0 0 10px 0; font-size: 18px; color: #333;">Order Delivery</h3>
              <p style="margin: 0; font-size: 16px; color: #555; line-height: 1.6;">
                Your metals arrive at your address and your order is complete.
              </p>
              <p style="margin: 12px 0 0 0; font-size: 16px; color: #333; font-weight: bold;">
                You now officially own and possess your physical precious metals.
              </p>
            </td>
          </tr>
        </table>
      </div>

    </div>

    <!-- Questions Section -->
    <div style="margin-top: 30px; padding: 20px; background-color: #f9f9f9; border-radius: 8px; border-left: 4px solid #c9a227;">
      <p style="margin: 0; font-size: 16px; color: #333; line-height: 1.7;">
        <strong>Questions?</strong> Our team is always available to assist you. Simply reply to this email or call us directly.
      </p>
    </div>

    <p style="font-size: 17px; color: #333; line-height: 1.8; margin-top: 30px; margin-bottom: 25px;">
      We appreciate the trust you have placed in Voice Alchemy Academy and look forward to serving you for many years to come.
    </p>

    <p style="font-size: 17px; color: #333; line-height: 1.7; margin-bottom: 5px;">
      Warm regards,
    </p>

    ${generateSignatureHtml(repName, repPhone, repEmail)}
  </div>

  <!-- Footer -->
  <div style="background-color: #f0f0f0; padding: 25px 20px; text-align: center; font-size: 12px; color: #666;">
    <p style="margin: 0 0 10px 0;">
      Voice Alchemy Academy | 2029 Century Park E #400N | Los Angeles, CA 90067
    </p>
    <p style="margin: 0;">
      <a href="#" style="color: #666; text-decoration: underline;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>
`
  }
}

// Annuity Awareness email template
const annuityTemplate: EmailTemplate = {
  id: 'annuity-awareness',
  name: 'Annuity Awareness',
  description: 'For prospects with annuities or considering them',
  subject: 'Quick follow-up on our conversation about annuities',
  category: 'marketing',
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', Times, serif; background-color: #f5f5f5;">
  <!-- Preheader -->
  <div style="font-size: 12px; text-align: center; padding: 12px 20px; background-color: #3d4a3a; color: #ccc;">
    Thank you for considering Voice Alchemy Academy for your gold and silver needs. If you're no longer interested in our content, please use the unsubscribe button at the bottom of the page.
  </div>

  <!-- Header with Logo -->
  <div style="background-color: #3d4a3a; padding: 20px 20px 25px; text-align: center; border-bottom: 3px solid #d4af37;">
    <img src="${EMAIL_IMAGES.logo}" alt="Voice Alchemy Academy" style="height: 80px; margin-bottom: 12px;">
    <div style="color: #fff; font-size: 14px;">
      800-605-5597 | <a href="https://www.voicealchemyacademy.com" style="color: #d4af37; text-decoration: underline;">voicealchemyacademy.com</a>
    </div>
  </div>

  <!-- Main Content -->
  <div style="background-color: #ffffff; padding: 40px 30px; max-width: 600px; margin: 0 auto;">
    <!-- Title -->
    <h1 style="text-align: center; margin: 0 0 5px 0; font-size: 28px; font-weight: normal;">
      <span style="color: #c9a227;">Annuities</span> <span style="color: #333;">vs</span>
    </h1>
    <h2 style="text-align: center; margin: 0 0 10px 0; font-size: 24px; font-weight: normal; color: #333;">
      Other Asset Classes
    </h2>
    <p style="text-align: center; margin: 0 0 25px 0; font-size: 16px; color: #666;">
      <span style="color: #c9a227;">What Many Investors Don't Realize</span>
    </p>

    <!-- Personal Message -->
    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Hi ${firstName},
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      It was great chatting with you earlier about annuities and retirement income planning. I wanted to share a quick visual that breaks down how annuities are structured and what many investors don't realize until after they've signed.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Below is a simple comparison highlighting how annuities work versus other asset classes:
    </p>

    <!-- Chart Image -->
    <div style="text-align: center; margin-bottom: 30px;">
      <img src="${EMAIL_IMAGES.annuityChart}" alt="Annuities vs Other Asset Classes Comparison" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
    </div>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Many investors choose annuities for perceived safety, but that safety often comes with caps, surrender periods, and limited liquidity. Understanding how commissions, lock-up periods, and participation limits function is key before committing long-term capital.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      I've also attached our full Annuity Guide, where we compare annuities vs. other asset classes in more detail, so you can review everything at your own pace. Once you've had a chance to look it over, I'm happy to talk through what might make sense based on your goals.
    </p>

    <!-- Download Guide CTA - Above signature -->
    <div style="margin: 30px 0; text-align: center;">
      <a href="https://www.voicealchemyacademy.com/thank-you" style="display: inline-block; text-decoration: none;">
        <img src="${EMAIL_IMAGES.annuityGuide}" alt="Download Our Annuity Guide" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
      </a>
    </div>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 5px;">
      Looking forward to continuing the conversation,
    </p>

    ${generateSignatureHtml(repName, repPhone, repEmail)}
  </div>

  <!-- Footer -->
  <div style="background-color: #f0f0f0; padding: 25px 20px; text-align: center; font-size: 12px; color: #666;">
    <p style="margin: 0 0 10px 0;">
      Voice Alchemy Academy | 2029 Century Park E #400N | Los Angeles, CA 90067
    </p>
    <p style="margin: 0;">
      <a href="#" style="color: #666; text-decoration: underline;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>
`
  }
}

// Bond Market Awareness email template
const bondMarketTemplate: EmailTemplate = {
  id: 'bond-market',
  name: 'Bond Market Awareness',
  description: 'For prospects with bonds or fixed-income investments',
  subject: 'Quick follow-up on our conversation about bonds',
  category: 'marketing',
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', Times, serif; background-color: #f5f5f5;">
  <!-- Preheader -->
  <div style="font-size: 12px; text-align: center; padding: 12px 20px; background-color: #3d4a3a; color: #ccc;">
    Thank you for considering Voice Alchemy Academy for your gold and silver needs. If you're no longer interested in our content, please use the unsubscribe button at the bottom of the page.
  </div>

  <!-- Header with Logo -->
  <div style="background-color: #3d4a3a; padding: 20px 20px 25px; text-align: center; border-bottom: 3px solid #d4af37;">
    <img src="${EMAIL_IMAGES.logo}" alt="Voice Alchemy Academy" style="height: 80px; margin-bottom: 12px;">
    <div style="color: #fff; font-size: 14px;">
      800-605-5597 | <a href="https://www.voicealchemyacademy.com" style="color: #d4af37; text-decoration: underline;">voicealchemyacademy.com</a>
    </div>
  </div>

  <!-- Main Content -->
  <div style="background-color: #ffffff; padding: 40px 30px; max-width: 600px; margin: 0 auto;">
    <!-- Title -->
    <h1 style="text-align: center; margin: 0 0 5px 0; font-size: 28px; font-weight: normal;">
      <span style="color: #c9a227;">Bonds</span> <span style="color: #333;">vs</span>
    </h1>
    <h2 style="text-align: center; margin: 0 0 10px 0; font-size: 24px; font-weight: normal; color: #333;">
      Gold Performance
    </h2>
    <p style="text-align: center; margin: 0 0 25px 0; font-size: 16px; color: #666;">
      <span style="color: #c9a227;">A 10-Year Comparison</span>
    </p>

    <!-- Personal Message -->
    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Hi ${firstName},
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      It was great chatting with you earlier about the bond market and current interest rate conditions. I wanted to share a quick visual that highlights what's happening in today's bond environment and why many investors are reassessing traditional fixed-income strategies.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Below is a snapshot comparing long-term bond performance versus gold over a 10-year period:
    </p>

    <!-- Chart Image -->
    <div style="text-align: center; margin-bottom: 30px;">
      <img src="${EMAIL_IMAGES.bondChart}" alt="Bonds vs Gold 10-Year Comparison" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
    </div>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      While bonds have historically been viewed as "safe," rising yields, expanding debt issuance, and inflation pressures are creating both price risk and confidence risk. Long-term bonds in particular have been more vulnerable during periods of fiscal uncertainty and rate volatility.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      I've also attached our full Bond Market Update, where we break down the current risks and outline why many investors are diversifying into hard assets. Once you've had a chance to review it, I'm happy to talk through what might make sense based on your goals.
    </p>

    <!-- Download Guide CTA - Above signature -->
    <div style="margin: 30px 0; text-align: center;">
      <a href="https://www.voicealchemyacademy.com/thank-you" style="display: inline-block; text-decoration: none;">
        <img src="${EMAIL_IMAGES.bondGuide}" alt="Download Our Bond Market Update" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
      </a>
    </div>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 5px;">
      Looking forward to continuing the conversation,
    </p>

    ${generateSignatureHtml(repName, repPhone, repEmail)}
  </div>

  <!-- Footer -->
  <div style="background-color: #f0f0f0; padding: 25px 20px; text-align: center; font-size: 12px; color: #666;">
    <p style="margin: 0 0 10px 0;">
      Voice Alchemy Academy | 2029 Century Park E #400N | Los Angeles, CA 90067
    </p>
    <p style="margin: 0;">
      <a href="#" style="color: #666; text-decoration: underline;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>
`
  }
}

// CD Guide email template
const cdGuideTemplate: EmailTemplate = {
  id: 'cd-guide',
  name: 'Gold vs CDs',
  description: 'For prospects with CDs or certificates of deposit',
  subject: 'Quick follow-up on our conversation about CDs and gold',
  category: 'marketing',
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', Times, serif; background-color: #f5f5f5;">
  <!-- Preheader -->
  <div style="font-size: 12px; text-align: center; padding: 12px 20px; background-color: #3d4a3a; color: #ccc;">
    Thank you for considering Voice Alchemy Academy for your gold and silver needs. If you're no longer interested in our content, please use the unsubscribe button at the bottom of the page.
  </div>

  <!-- Header with Logo -->
  <div style="background-color: #3d4a3a; padding: 20px 20px 25px; text-align: center; border-bottom: 3px solid #d4af37;">
    <img src="${EMAIL_IMAGES.logo}" alt="Voice Alchemy Academy" style="height: 80px; margin-bottom: 12px;">
    <div style="color: #fff; font-size: 14px;">
      800-605-5597 | <a href="https://www.voicealchemyacademy.com" style="color: #d4af37; text-decoration: underline;">voicealchemyacademy.com</a>
    </div>
  </div>

  <!-- Main Content -->
  <div style="background-color: #ffffff; padding: 40px 30px; max-width: 600px; margin: 0 auto;">
    <!-- Title -->
    <h1 style="text-align: center; margin: 0 0 5px 0; font-size: 28px; font-weight: normal;">
      <span style="color: #333;">The Truth About</span> <span style="color: #c9a227;">CDs</span>
    </h1>
    <h2 style="text-align: center; margin: 0 0 10px 0; font-size: 24px; font-weight: normal; color: #333;">
      And Why Smart Investors Are Moving to Gold
    </h2>
    <p style="text-align: center; margin: 0 0 25px 0; font-size: 16px; color: #666;">
      <span style="color: #c9a227;">What Your Bank Doesn't Tell You About "Safe" Returns</span>
    </p>

    <!-- Chart Image -->
    <div style="text-align: center; margin-bottom: 30px;">
      <img src="${EMAIL_IMAGES.cdChart}" alt="CDs vs Gold - Inflation Impact Comparison" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
    </div>

    <!-- Personal Message -->
    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Hi ${firstName},
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      It was great chatting with you earlier about your CDs and savings. I wanted to share something that many investors find eye-opening when evaluating traditional "safe" investments.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      While CDs offer a fixed interest rate, they often don't keep pace with inflation. At 4-6% annual inflation, a 3-4% CD yield means your purchasing power is actually declining — even though your balance looks stable.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Gold, on the other hand, has historically served as a store of value that protects purchasing power during inflationary periods. It requires no management, carries no counterparty risk, and isn't subject to bank policies or early withdrawal penalties.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      I've attached our full guide comparing CDs to gold so you can review the details at your own pace. Once you've had a chance to look it over, I'm happy to discuss what might make sense for your situation.
    </p>

    <!-- Download Guide CTA -->
    <div style="margin: 30px 0; text-align: center;">
      <a href="https://www.voicealchemyacademy.com/thank-you" style="display: inline-block; text-decoration: none;">
        <img src="${EMAIL_IMAGES.cdGuide}" alt="Download Our CD vs Gold Guide" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
      </a>
    </div>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 5px;">
      Looking forward to continuing the conversation,
    </p>

    ${generateSignatureHtml(repName, repPhone, repEmail)}
  </div>

  <!-- Footer -->
  <div style="background-color: #f0f0f0; padding: 25px 20px; text-align: center; font-size: 12px; color: #666;">
    <p style="margin: 0 0 10px 0;">
      Voice Alchemy Academy | 2029 Century Park E #400N | Los Angeles, CA 90067
    </p>
    <p style="margin: 0;">
      <a href="#" style="color: #666; text-decoration: underline;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>
`
  }
}

// Gold vs Real Estate email template
const realEstateTemplate: EmailTemplate = {
  id: 'gold-vs-realestate',
  name: 'Gold vs Real Estate',
  description: 'For prospects with real estate investments',
  subject: 'Quick follow-up on our conversation about real estate and gold',
  category: 'marketing',
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', Times, serif; background-color: #f5f5f5;">
  <!-- Preheader -->
  <div style="font-size: 12px; text-align: center; padding: 12px 20px; background-color: #3d4a3a; color: #ccc;">
    Thank you for considering Voice Alchemy Academy for your gold and silver needs. If you're no longer interested in our content, please use the unsubscribe button at the bottom of the page.
  </div>

  <!-- Header with Logo -->
  <div style="background-color: #3d4a3a; padding: 20px 20px 25px; text-align: center; border-bottom: 3px solid #d4af37;">
    <img src="${EMAIL_IMAGES.logo}" alt="Voice Alchemy Academy" style="height: 80px; margin-bottom: 12px;">
    <div style="color: #fff; font-size: 14px;">
      800-605-5597 | <a href="https://www.voicealchemyacademy.com" style="color: #d4af37; text-decoration: underline;">voicealchemyacademy.com</a>
    </div>
  </div>

  <!-- Main Content -->
  <div style="background-color: #ffffff; padding: 40px 30px; max-width: 600px; margin: 0 auto;">
    <!-- Title -->
    <h1 style="text-align: center; margin: 0 0 5px 0; font-size: 28px; font-weight: normal;">
      <span style="color: #c9a227;">Gold</span> <span style="color: #333;">vs Real Estate</span>
    </h1>
    <h2 style="text-align: center; margin: 0 0 10px 0; font-size: 24px; font-weight: normal; color: #333;">
      The Smarter Way to Build Wealth
    </h2>
    <p style="text-align: center; margin: 0 0 25px 0; font-size: 16px; color: #666;">
      <span style="color: #c9a227;">A 10-Year Performance & Cost Comparison</span>
    </p>

    <!-- Chart Image -->
    <div style="text-align: center; margin-bottom: 30px;">
      <img src="${EMAIL_IMAGES.realEstateChart}" alt="Gold vs Real Estate 10-Year Comparison" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
    </div>

    <!-- Personal Message -->
    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Hi ${firstName},
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      It was great chatting with you earlier about your real estate holdings. I wanted to share a quick comparison that many property investors find valuable when evaluating their overall portfolio.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      While real estate can build wealth over time, it comes with significant carrying costs — mortgage interest, property taxes, insurance, maintenance, and management fees. These expenses can meaningfully reduce your net returns, especially when markets soften.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Gold offers a different approach: no tenants, no repairs, no property taxes, and no ongoing management. It's liquid, portable, and has historically preserved wealth through economic uncertainty. Over the past decade, gold has actually outperformed real estate in total returns.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      I've attached our full Gold vs Real Estate guide so you can see the detailed comparison. Once you've had a chance to review it, I'd love to discuss how gold might complement your current holdings.
    </p>

    <!-- Download Guide CTA -->
    <div style="margin: 30px 0; text-align: center;">
      <a href="https://www.voicealchemyacademy.com/thank-you" style="display: inline-block; text-decoration: none;">
        <img src="${EMAIL_IMAGES.realEstateGuide}" alt="Download Our Gold vs Real Estate Guide" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
      </a>
    </div>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 5px;">
      Looking forward to continuing the conversation,
    </p>

    ${generateSignatureHtml(repName, repPhone, repEmail)}
  </div>

  <!-- Footer -->
  <div style="background-color: #f0f0f0; padding: 25px 20px; text-align: center; font-size: 12px; color: #666;">
    <p style="margin: 0 0 10px 0;">
      Voice Alchemy Academy | 2029 Century Park E #400N | Los Angeles, CA 90067
    </p>
    <p style="margin: 0;">
      <a href="#" style="color: #666; text-decoration: underline;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>
`
  }
}

// Gold vs Cash (comprehensive) email template
const goldVsCashTemplate: EmailTemplate = {
  id: 'gold-vs-cash-guide',
  name: 'Gold vs Cash Guide',
  description: 'For prospects holding cash savings or checking accounts',
  subject: 'Quick follow-up on our conversation about protecting your cash',
  category: 'marketing',
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', Times, serif; background-color: #f5f5f5;">
  <!-- Preheader -->
  <div style="font-size: 12px; text-align: center; padding: 12px 20px; background-color: #3d4a3a; color: #ccc;">
    Thank you for considering Voice Alchemy Academy for your gold and silver needs. If you're no longer interested in our content, please use the unsubscribe button at the bottom of the page.
  </div>

  <!-- Header with Logo -->
  <div style="background-color: #3d4a3a; padding: 20px 20px 25px; text-align: center; border-bottom: 3px solid #d4af37;">
    <img src="${EMAIL_IMAGES.logo}" alt="Voice Alchemy Academy" style="height: 80px; margin-bottom: 12px;">
    <div style="color: #fff; font-size: 14px;">
      800-605-5597 | <a href="https://www.voicealchemyacademy.com" style="color: #d4af37; text-decoration: underline;">voicealchemyacademy.com</a>
    </div>
  </div>

  <!-- Main Content -->
  <div style="background-color: #ffffff; padding: 40px 30px; max-width: 600px; margin: 0 auto;">
    <!-- Title -->
    <h1 style="text-align: center; margin: 0 0 5px 0; font-size: 28px; font-weight: normal;">
      <span style="color: #333;">The Real Cost of</span> <span style="color: #c9a227;">Holding Cash</span>
    </h1>
    <h2 style="text-align: center; margin: 0 0 10px 0; font-size: 24px; font-weight: normal; color: #333;">
      Why Your Savings May Be Losing Value
    </h2>
    <p style="text-align: center; margin: 0 0 25px 0; font-size: 16px; color: #666;">
      <span style="color: #c9a227;">A 10-Year Buying Power Comparison</span>
    </p>

    <!-- Chart Image -->
    <div style="text-align: center; margin-bottom: 30px;">
      <img src="${EMAIL_IMAGES.cashChart}" alt="Gold vs Cash Buying Power Comparison" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
    </div>

    <!-- Personal Message -->
    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Hi ${firstName},
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      It was great chatting with you earlier about your savings strategy. I wanted to share something that helps illustrate why holding cash long-term can be more costly than it appears.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Cash feels safe because the number in your account stays the same. But at 4-6% annual inflation, your purchasing power is quietly eroding every year. Over the past decade, the dollar has lost roughly 35% of its buying power — while gold has increased by nearly 300%.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Unlike currency, gold cannot be printed or diluted through policy decisions. Its supply grows slowly, and it has served as a store of value through recessions, wars, and currency devaluations throughout history.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      I've attached our comprehensive Gold vs Cash guide that breaks down the comparison in detail. Once you've had a chance to review it, I'd be happy to discuss how gold might help protect a portion of your savings.
    </p>

    <!-- Download Guide CTA -->
    <div style="margin: 30px 0; text-align: center;">
      <a href="https://www.voicealchemyacademy.com/thank-you" style="display: inline-block; text-decoration: none;">
        <img src="${EMAIL_IMAGES.cashGuide}" alt="Download Our Gold vs Cash Guide" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
      </a>
    </div>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 5px;">
      Looking forward to continuing the conversation,
    </p>

    ${generateSignatureHtml(repName, repPhone, repEmail)}
  </div>

  <!-- Footer -->
  <div style="background-color: #f0f0f0; padding: 25px 20px; text-align: center; font-size: 12px; color: #666;">
    <p style="margin: 0 0 10px 0;">
      Voice Alchemy Academy | 2029 Century Park E #400N | Los Angeles, CA 90067
    </p>
    <p style="margin: 0;">
      <a href="#" style="color: #666; text-decoration: underline;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>
`
  }
}

// Gold vs Stock Markets email template
const stockMarketTemplate: EmailTemplate = {
  id: 'gold-vs-stocks',
  name: 'Gold vs Stock Markets',
  description: 'For prospects with stock market investments',
  subject: 'Quick follow-up on our conversation about stocks and gold',
  category: 'marketing',
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', Times, serif; background-color: #f5f5f5;">
  <!-- Preheader -->
  <div style="font-size: 12px; text-align: center; padding: 12px 20px; background-color: #3d4a3a; color: #ccc;">
    Thank you for considering Voice Alchemy Academy for your gold and silver needs. If you're no longer interested in our content, please use the unsubscribe button at the bottom of the page.
  </div>

  <!-- Header with Logo -->
  <div style="background-color: #3d4a3a; padding: 20px 20px 25px; text-align: center; border-bottom: 3px solid #d4af37;">
    <img src="${EMAIL_IMAGES.logo}" alt="Voice Alchemy Academy" style="height: 80px; margin-bottom: 12px;">
    <div style="color: #fff; font-size: 14px;">
      800-605-5597 | <a href="https://www.voicealchemyacademy.com" style="color: #d4af37; text-decoration: underline;">voicealchemyacademy.com</a>
    </div>
  </div>

  <!-- Main Content -->
  <div style="background-color: #ffffff; padding: 40px 30px; max-width: 600px; margin: 0 auto;">
    <!-- Title -->
    <h1 style="text-align: center; margin: 0 0 5px 0; font-size: 28px; font-weight: normal;">
      <span style="color: #c9a227;">Gold</span> <span style="color: #333;">vs</span> <span style="color: #333;">The Stock Market</span>
    </h1>
    <h2 style="text-align: center; margin: 0 0 10px 0; font-size: 24px; font-weight: normal; color: #333;">
      Why Diversification Matters More Than Ever
    </h2>
    <p style="text-align: center; margin: 0 0 25px 0; font-size: 16px; color: #666;">
      <span style="color: #c9a227;">A Look at Performance During Market Volatility</span>
    </p>

    <!-- Chart Image -->
    <div style="text-align: center; margin-bottom: 30px;">
      <img src="${EMAIL_IMAGES.stockChart}" alt="Gold vs Stock Market Performance Comparison" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
    </div>

    <!-- Personal Message -->
    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Hi ${firstName},
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      It was great chatting with you earlier about your investment portfolio and stock market exposure. I wanted to share something that many investors find valuable when considering how to balance their holdings.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      While stocks have historically offered growth potential, they also carry significant volatility risk. During market corrections — like 2008, 2020, and recent downturns — many portfolios experienced losses of 30-50% or more. Gold, on the other hand, has historically moved inversely to stocks during periods of market stress.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Gold isn't about replacing your stock investments — it's about providing a counterbalance. When equities struggle, physical gold often holds value or appreciates, helping protect your overall wealth from market volatility.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      I've attached our comprehensive Gold vs Stock Markets guide that breaks down historical performance during key economic events. Once you've had a chance to review it, I'd be happy to discuss how gold might fit into your diversification strategy.
    </p>

    <!-- Download Guide CTA -->
    <div style="margin: 30px 0; text-align: center;">
      <a href="https://www.voicealchemyacademy.com/thank-you" style="display: inline-block; text-decoration: none;">
        <img src="${EMAIL_IMAGES.stockGuide}" alt="Download Our Gold vs Stock Markets Guide" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
      </a>
    </div>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 5px;">
      Looking forward to continuing the conversation,
    </p>

    ${generateSignatureHtml(repName, repPhone, repEmail)}
  </div>

  <!-- Footer -->
  <div style="background-color: #f0f0f0; padding: 25px 20px; text-align: center; font-size: 12px; color: #666;">
    <p style="margin: 0 0 10px 0;">
      Voice Alchemy Academy | 2029 Century Park E #400N | Los Angeles, CA 90067
    </p>
    <p style="margin: 0;">
      <a href="#" style="color: #666; text-decoration: underline;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>
`
  }
}

// Review Request email template
const reviewRequestTemplate: EmailTemplate = {
  id: 'review-request',
  name: 'Review Request',
  description: 'Ask satisfied customers to leave a positive review',
  subject: 'A Quick Favor — We\'d Love Your Feedback',
  category: 'marketing',
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', Times, serif; background-color: #f5f5f5;">
  <!-- Preheader -->
  <div style="font-size: 12px; text-align: center; padding: 12px 20px; background-color: #3d4a3a; color: #ccc;">
    Your feedback helps others make confident decisions about their financial future.
  </div>

  <!-- Header with Logo -->
  <div style="background-color: #3d4a3a; padding: 20px 20px 25px; text-align: center; border-bottom: 3px solid #d4af37;">
    <img src="${EMAIL_IMAGES.logo}" alt="Voice Alchemy Academy" style="height: 80px; margin-bottom: 12px;">
    <div style="color: #fff; font-size: 14px;">
      800-605-5597 | <a href="https://www.voicealchemyacademy.com" style="color: #d4af37; text-decoration: underline;">voicealchemyacademy.com</a>
    </div>
  </div>

  <!-- Main Content -->
  <div style="background-color: #ffffff; padding: 40px 30px; max-width: 600px; margin: 0 auto;">
    <!-- Title -->
    <h1 style="text-align: center; margin: 0 0 10px 0; font-size: 28px; font-weight: normal; color: #333;">
      Thank You for <span style="color: #c9a227;">Trusting Us</span>
    </h1>
    <p style="text-align: center; margin: 0 0 30px 0; font-size: 16px; color: #666;">
      Your experience matters to us — and to others
    </p>

    <!-- Personal Message -->
    <p style="font-size: 16px; color: #333; line-height: 1.8; margin-bottom: 20px;">
      Hi ${firstName},
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.8; margin-bottom: 20px;">
      Thank you again for choosing Voice Alchemy Academy. It was truly a pleasure working with you, and we're grateful for the opportunity to be part of your journey.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.8; margin-bottom: 20px;">
      We take a great deal of pride in delivering a thoughtful, transparent experience — and your feedback helps others feel confident when making important financial decisions.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.8; margin-bottom: 30px;">
      If you're open to it, we would sincerely appreciate you sharing your experience on any of the platforms below:
    </p>

    <!-- Review Buttons Section -->
    <div style="margin: 30px 0;">
      <!-- Better Business Bureau -->
      <a href="https://www.bbb.org/us/ca/inglewood/profile/precious-metal-dealers/citadel-gold-1216-1000042667/leave-a-review" style="text-decoration: none; display: block;">
        <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin-bottom: 15px; border-collapse: collapse;">
          <tr>
            <td style="background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%); border: 2px solid #e0e0e0; border-radius: 12px; padding: 18px 20px;">
              <table cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
                <tr>
                  <td style="width: 50px; vertical-align: middle;">
                    <img src="${EMAIL_IMAGES.sigBbb}" alt="BBB" style="width: 40px; height: auto;">
                  </td>
                  <td style="vertical-align: middle; padding-left: 15px;">
                    <p style="margin: 0; font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; color: #333;">Better Business Bureau</p>
                    <p style="margin: 4px 0 0 0; font-family: Arial, sans-serif; font-size: 13px; color: #666;">Review us on BBB</p>
                  </td>
                  <td style="width: 30px; vertical-align: middle; text-align: right;">
                    <span style="font-size: 20px; color: #c9a227;">→</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </a>

      <!-- Google Reviews -->
      <a href="https://www.google.com/search?kgmid=/g/11ybywn636&hl=en-US&q=Citadel+Gold&shem=epsdc,shrtsdl&shndl=30&source=sh/x/loc/osrp/m5/1&kgs=11d258a9f81f251c&utm_source=epsdc,shrtsdl,sh/x/loc/osrp/m5/1#lrd=0xf26264975d84705:0x981229be97f13f9a,1,,,," style="text-decoration: none; display: block;">
        <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin-bottom: 15px; border-collapse: collapse;">
          <tr>
            <td style="background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%); border: 2px solid #e0e0e0; border-radius: 12px; padding: 18px 20px; transition: all 0.3s;">
              <table cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
                <tr>
                  <td style="width: 50px; vertical-align: middle;">
                    <img src="${EMAIL_IMAGES.sigGoogle}" alt="Google" style="width: 40px; height: 40px;">
                  </td>
                  <td style="vertical-align: middle; padding-left: 15px;">
                    <p style="margin: 0; font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; color: #333;">Google Reviews</p>
                    <p style="margin: 4px 0 0 0; font-family: Arial, sans-serif; font-size: 13px; color: #666;">Share your experience on Google</p>
                  </td>
                  <td style="width: 30px; vertical-align: middle; text-align: right;">
                    <span style="font-size: 20px; color: #c9a227;">→</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </a>
    </div>

    <p style="font-size: 16px; color: #333; line-height: 1.8; margin-bottom: 20px;">
      Your words make a meaningful difference, and we're incredibly thankful for your time.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.8; margin-bottom: 25px;">
      If there's ever anything more we can assist you with, please don't hesitate to reach out.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 5px;">
      Warm regards,
    </p>

    ${generateSignatureHtml(repName, repPhone, repEmail)}
  </div>

  <!-- Footer -->
  <div style="background-color: #f0f0f0; padding: 25px 20px; text-align: center; font-size: 12px; color: #666;">
    <p style="margin: 0 0 10px 0;">
      Voice Alchemy Academy | 2029 Century Park E #400N | Los Angeles, CA 90067
    </p>
    <p style="margin: 0;">
      <a href="#" style="color: #666; text-decoration: underline;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>
`
  }
}

// As Featured In — press logos + a verified Google review, using the review card
// layout lifted from the voicealchemyacademy.com homepage (app/homepage/page.tsx).
const featuredInTemplate: EmailTemplate = {
  id: 'as-featured-in',
  name: 'As Featured In',
  description: 'Press coverage (BuzzFeed, OAN, FXStreet) plus a verified 5-star Google review',
  subject: 'A Brief Introduction to Voice Alchemy Academy',
  category: 'marketing',
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', Times, serif; background-color: #f5f5f5;">
  <!-- Preheader -->
  <div style="font-size: 12px; text-align: center; padding: 12px 20px; background-color: #3d4a3a; color: #ccc;">
    A brief note on who you're working with. Nothing needed on your end.
  </div>

  <!-- Header with Logo -->
  <div style="background-color: #3d4a3a; padding: 20px 20px 25px; text-align: center; border-bottom: 3px solid #d4af37;">
    <img src="${EMAIL_IMAGES.logo}" alt="Voice Alchemy Academy" style="height: 80px; margin-bottom: 12px;">
    <div style="color: #fff; font-size: 14px;">
      800-605-5597 | <a href="https://www.voicealchemyacademy.com" style="color: #d4af37; text-decoration: underline;">voicealchemyacademy.com</a>
    </div>
  </div>

  <!-- Main Content -->
  <div style="background-color: #ffffff; padding: 40px 30px; max-width: 600px; margin: 0 auto;">
    <!-- Title -->
    <p style="text-align: center; margin: 0 0 12px 0; font-family: Arial, sans-serif; font-size: 11px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; color: #b8860b;">
      A Brief Introduction
    </p>
    <h1 style="text-align: center; margin: 0 0 10px 0; font-size: 28px; font-weight: normal; color: #333;">
      In the Press, <span style="color: #c9a227; font-style: italic;">and in Practice</span>
    </h1>
    <p style="text-align: center; margin: 0 0 32px 0; font-size: 16px; color: #666;">
      Where our work has appeared &mdash; and how it is actually done
    </p>

    <!-- Personal Message -->
    <p style="font-size: 16px; color: #333; line-height: 1.8; margin-bottom: 20px;">
      Hi ${firstName},
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.8; margin-bottom: 30px;">
      When financial journalists ask where the precious-metals market may be headed, we are pleased to offer a measured perspective. Our commentary has appeared in the publications below, among others.
    </p>

    <!-- As Featured In -->
    <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; margin: 0 0 36px 0;">
      <tr>
        <td style="padding: 26px 20px 22px; background-color: #faf9f6; border: 1px solid #efe6d3;">
          <p style="margin: 0 0 20px 0; text-align: center; font-family: Arial, sans-serif; font-size: 11px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; color: #8a8278;">
            As Featured In
          </p>
          <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse;">
            <tr>
              <!-- BuzzFeed -->
              <td style="width: 33.33%; text-align: center; vertical-align: middle; padding: 4px 6px;">
                <span style="display: block; font-family: Helvetica, Arial, sans-serif; font-size: 20px; font-weight: bold; letter-spacing: -0.5px; color: #ee3322;">BuzzFeed</span>
              </td>
              <!-- OAN -->
              <td style="width: 33.33%; text-align: center; vertical-align: middle; padding: 4px 6px; border-left: 1px solid #e8e2d5; border-right: 1px solid #e8e2d5;">
                <span style="display: block; font-family: Helvetica, Arial, sans-serif; font-size: 20px; font-weight: bold; letter-spacing: 1px; color: #1b3a6b;">OAN</span>
                <span style="display: block; margin-top: 5px; font-family: Arial, sans-serif; font-size: 10px; letter-spacing: 0.5px; color: #8a8278;">One America News</span>
              </td>
              <!-- FXStreet -->
              <td style="width: 33.33%; text-align: center; vertical-align: middle; padding: 4px 6px;">
                <span style="display: block; font-family: Helvetica, Arial, sans-serif; font-size: 20px; font-weight: bold; letter-spacing: -0.3px; color: #1a1915;">FX<span style="color: #d4af37;">Street</span></span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="font-size: 16px; color: #333; line-height: 1.8; margin-bottom: 20px;">
      Media recognition is appreciated. But it is not how we measure our work.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.8; margin-bottom: 30px;">
      What matters most is the experience our clients have when they place their trust in us&mdash;particularly when navigating a decision as important as moving retirement assets into physical precious metals.
    </p>

    <!-- Authority line + 5-star Google badge -->
    <h2 style="text-align: center; margin: 0 0 18px 0; font-size: 24px; font-weight: normal; color: #333;">
      The Trusted Precious Metals <span style="color: #c9a227; font-style: italic;">Authority</span>
    </h2>

    <!-- Verified Google Review Card -->
    <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; margin: 0 0 20px 0;">
      <tr>
        <td style="background-color: #ffffff; border: 1px solid #efe6d3; box-shadow: 0 6px 28px rgba(0, 0, 0, 0.05); padding: 34px 30px 28px;">
          <!-- Google 5-star mark, centered, with the quote mark held to the right -->
          <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td width="46" style="width: 46px; font-size: 0; line-height: 0;">&nbsp;</td>
              <td align="center" style="text-align: center; vertical-align: middle;">
                <img src="${EMAIL_IMAGES.google5Star}" alt="5-star reviews on Google" width="140" style="width: 140px; max-width: 140px; height: auto; display: inline-block;">
              </td>
              <td width="46" style="width: 46px; vertical-align: top; text-align: right; font-family: Georgia, 'Times New Roman', serif; font-size: 56px; line-height: 0.7; color: #f2e8cf;">
                &ldquo;
              </td>
            </tr>
          </table>

          <!-- Quote -->
          <p style="margin: 22px 0 0 0; font-family: Georgia, 'Times New Roman', serif; font-size: 18px; line-height: 1.55; color: #33302a;">
            I had a 401k with a previous employer that is based off the stock market and because of the ups and downs in the market I knew rolling over into a gold IRA was the best way to go. Voice Alchemy Academy worked with me patiently moving the money over from my custodian that tried preventing me from moving my own money. Voice Alchemy Academy stepped in and got the money out from my old 401k. Once the money came into my new gold IRA, they showed me the best precious metals to have. Voice Alchemy Academy was excellent to work with.
          </p>

          <!-- Reviewer -->
          <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; margin-top: 22px; border-top: 1px solid #ededea;">
            <tr>
              <td style="width: 44px; padding-top: 20px; vertical-align: middle;">
                <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
                  <tr>
                    <td width="44" height="44" align="center" valign="middle" style="width: 44px; height: 44px; background-color: #c9a227; border-radius: 22px; font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; letter-spacing: 0.5px; color: #ffffff;">
                      MB
                    </td>
                  </tr>
                </table>
              </td>
              <td style="padding: 20px 0 0 14px; vertical-align: middle;">
                <p style="margin: 0 0 4px 0; font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; color: #1a1915;">
                  Michael Boyicich
                </p>
                <p style="margin: 0; font-family: Arial, sans-serif; font-size: 11px; color: #8a8278;">
                  <img src="${EMAIL_IMAGES.sigGoogle}" alt="Google" width="13" height="13" style="width: 13px; height: 13px; vertical-align: middle; margin-right: 5px;">Posted on Google
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Google badge -->
    <p style="text-align: center; margin: 0 0 30px 0; font-family: Arial, sans-serif; font-size: 12px; color: #8a8278;">
      <img src="${EMAIL_IMAGES.sigGoogle}" alt="Google" width="16" height="16" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 6px;">
      <a href="https://www.google.com/search?q=Citadel+Gold+reviews" style="color: #b8860b; text-decoration: underline;">More reviews on Google</a>
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.8; margin-bottom: 20px;">
      This is the standard we work to uphold with every client: thoughtful guidance, careful coordination and personal attention from the first conversation through final delivery.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.8; margin-bottom: 20px;">
      You will work with the same people throughout the process. You will have a direct line rather than being passed through a call queue. And you will always know what is happening, what comes next and who is handling it.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.8; margin-bottom: 20px;">
      Should you ever wish to discuss your retirement holdings, the role precious metals could play in your broader strategy, or simply ask a few questions, my direct number is below.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.8; margin-bottom: 25px;">
      I answer it personally.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 5px;">
      Warm regards,
    </p>

    ${generateSignatureHtml(repName, repPhone, repEmail)}
  </div>

  <!-- Footer -->
  <div style="background-color: #f0f0f0; padding: 25px 20px; text-align: center; font-size: 12px; color: #666;">
    <p style="margin: 0 0 10px 0;">
      Voice Alchemy Academy | 2029 Century Park E #400N | Los Angeles, CA 90067
    </p>
    <p style="margin: 0;">
      <a href="#" style="color: #666; text-decoration: underline;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>
`
  }
}

// Public URL for the 2026 Silver Report PDF (hosted on Supabase storage)
const SILVER_REPORT_PDF_URL = 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/documents/marketing/2026-silver-report.pdf'
const SILVER_MACHINE_PDF_URL = 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/documents/marketing/silver-metal-inside-the-machine.pdf'

// 2026 Silver Report email template
const silverReportTemplate: EmailTemplate = {
  id: 'silver-report',
  name: '2026 Silver Report',
  description: 'Offers the complimentary 2026 Silver Report download',
  subject: 'Download Your Complimentary 2026 Silver Report',
  category: 'marketing',
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', Times, serif; background-color: #f5f5f5;">
  <!-- Preheader -->
  <div style="font-size: 12px; text-align: center; padding: 12px 20px; background-color: #3d4a3a; color: #ccc;">
    Thank you for considering Voice Alchemy Academy for your gold and silver needs. If you're no longer interested in our content, please use the unsubscribe button at the bottom of the page.
  </div>

  <!-- Header with Logo -->
  <div style="background-color: #3d4a3a; padding: 20px 20px 25px; text-align: center; border-bottom: 3px solid #d4af37;">
    <img src="${EMAIL_IMAGES.logo}" alt="Voice Alchemy Academy" style="height: 80px; margin-bottom: 12px;">
    <div style="color: #fff; font-size: 14px;">
      800-605-5597 | <a href="https://www.voicealchemyacademy.com" style="color: #d4af37; text-decoration: underline;">voicealchemyacademy.com</a>
    </div>
  </div>

  <!-- Main Content -->
  <div style="background-color: #ffffff; padding: 40px 30px; max-width: 600px; margin: 0 auto;">
    <!-- Title -->
    <h1 style="text-align: center; margin: 0 0 5px 0; font-size: 28px; font-weight: normal;">
      <span style="color: #333;">The</span> <span style="color: #c9a227;">2026 Silver Report</span>
    </h1>
    <h2 style="text-align: center; margin: 0 0 25px 0; font-size: 22px; font-weight: normal; color: #333;">
      Your Complimentary Guide to Today's Silver Market
    </h2>

    <!-- Personal Message -->
    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Hi ${firstName},
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Silver continues to attract attention as both a precious metal and an essential industrial resource.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Voice Alchemy Academy's complimentary 2026 Silver Report explores the forces shaping today's silver market, including supply deficits, industrial demand, solar energy, electric vehicles, AI infrastructure, and silver's potential role alongside gold.
    </p>

    <!-- Download CTA -->
    <div style="margin: 30px 0; text-align: center;">
      <a href="${SILVER_REPORT_PDF_URL}" style="display: inline-block; background-color: #c9a227; color: #ffffff; font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; text-decoration: none; padding: 16px 36px; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
        Download the 2026 Silver Report
      </a>
    </div>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      The report also compares physical silver with ETFs, mining stocks, and other forms of silver exposure, while outlining the risks and practical considerations investors should understand.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Please feel free to reach out with any questions after reviewing it.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 5px;">
      Best,
    </p>

    ${generateSignatureHtml(repName, repPhone, repEmail)}
  </div>

  <!-- Footer -->
  <div style="background-color: #f0f0f0; padding: 25px 20px; text-align: center; font-size: 12px; color: #666;">
    <p style="margin: 0 0 10px 0;">
      Voice Alchemy Academy | 2029 Century Park E #400N | Los Angeles, CA 90067
    </p>
    <p style="margin: 0;">
      <a href="#" style="color: #666; text-decoration: underline;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>
`
  }
}

// Silver: The Metal Inside the Machine special report email template
const silverMachineTemplate: EmailTemplate = {
  id: 'silver-metal-inside-machine',
  name: 'Silver: Metal Inside the Machine',
  description: 'Offers the "Silver: The Metal Inside the Machine" special report download',
  subject: 'New Report — Silver: The Metal Inside the Machine',
  category: 'marketing',
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', Times, serif; background-color: #f5f5f5;">
  <!-- Preheader -->
  <div style="font-size: 12px; text-align: center; padding: 12px 20px; background-color: #3d4a3a; color: #ccc;">
    Thank you for considering Voice Alchemy Academy for your gold and silver needs. If you're no longer interested in our content, please use the unsubscribe button at the bottom of the page.
  </div>

  <!-- Header with Logo -->
  <div style="background-color: #3d4a3a; padding: 20px 20px 25px; text-align: center; border-bottom: 3px solid #d4af37;">
    <img src="${EMAIL_IMAGES.logo}" alt="Voice Alchemy Academy" style="height: 80px; margin-bottom: 12px;">
    <div style="color: #fff; font-size: 14px;">
      800-605-5597 | <a href="https://www.voicealchemyacademy.com" style="color: #d4af37; text-decoration: underline;">voicealchemyacademy.com</a>
    </div>
  </div>

  <!-- Main Content -->
  <div style="background-color: #ffffff; padding: 40px 30px; max-width: 600px; margin: 0 auto;">
    <!-- Title -->
    <h1 style="text-align: center; margin: 0 0 5px 0; font-size: 28px; font-weight: normal;">
      <span style="color: #333;">Silver:</span> <span style="color: #c9a227;">The Metal Inside the Machine</span>
    </h1>
    <h2 style="text-align: center; margin: 0 0 25px 0; font-size: 20px; font-weight: normal; color: #333;">
      A New Special Report from Voice Alchemy Academy
    </h2>

    <!-- Personal Message -->
    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Hi ${firstName},
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Most people think of silver as coins, bars, and jewelry. But today, it also plays a critical role inside electric vehicles, solar panels, data centers, electronics, charging stations, and the modern power grid.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      Our new special report, <em>Silver: The Metal Inside the Machine</em>, explores how the technologies reshaping the global economy are also transforming industrial demand for silver&mdash;and why its supply picture is becoming increasingly important.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 10px;">
      You can read the complimentary report here:
    </p>

    <!-- Download CTA -->
    <div style="margin: 20px 0 30px; text-align: center;">
      <a href="${SILVER_MACHINE_PDF_URL}" style="display: inline-block; background-color: #c9a227; color: #ffffff; font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; text-decoration: none; padding: 16px 36px; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
        Download the Silver Report
      </a>
    </div>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 20px;">
      After you've had a chance to review it, feel free to reach out with any questions. We're always happy to help you better understand the role physical gold and silver may play in your financial strategy.
    </p>

    <p style="font-size: 16px; color: #333; line-height: 1.7; margin-bottom: 5px;">
      Best,
    </p>

    ${generateSignatureHtml(repName, repPhone, repEmail)}
  </div>

  <!-- Footer -->
  <div style="background-color: #f0f0f0; padding: 25px 20px; text-align: center; font-size: 12px; color: #666;">
    <p style="margin: 0 0 10px 0;">
      Voice Alchemy Academy | 2029 Century Park E #400N | Los Angeles, CA 90067
    </p>
    <p style="margin: 0;">
      <a href="#" style="color: #666; text-decoration: underline;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>
`
  }
}

const templates: EmailTemplate[] = [cashEmailTemplate, metalsComparisonTemplate, annuityTemplate, bondMarketTemplate, cdGuideTemplate, realEstateTemplate, goldVsCashTemplate, stockMarketTemplate, silverReportTemplate, silverMachineTemplate, featuredInTemplate, reviewRequestTemplate, wireTransferTemplate, checkPaymentTemplate, orderConfirmationTemplate]

// Organize templates into categories
const templateCategories: TemplateCategory[] = [
  {
    id: 'marketing',
    name: 'Marketing',
    icon: Megaphone,
    templates: templates.filter(t => t.category === 'marketing'),
  },
  {
    id: 'payment',
    name: 'Payment Instructions',
    icon: CreditCard,
    templates: templates.filter(t => t.category === 'payment'),
  },
]

export default function QuickSendPage() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<EmailAccount | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate>(templates[0])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [repInfo, setRepInfo] = useState({ name: '', phone: '800-605-5597', email: '' })
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['marketing', 'payment'])

  // Form fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')

  // Editable canvas state
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [previewHtml, setPreviewHtml] = useState('')
  const [subject, setSubject] = useState(templates[0].subject)
  const [isEditing, setIsEditing] = useState(false)
  const [hasEdits, setHasEdits] = useState(false)

  // Show preview when all required fields are filled
  const showPreview = firstName.trim() !== '' && email.trim() !== ''

  useEffect(() => {
    loadData()
  }, [])

  // Keep the preview canvas in sync with the template/contact — unless the user
  // is actively editing or has made manual edits they want to keep.
  useEffect(() => {
    if (!isEditing && !hasEdits) {
      setPreviewHtml(
        selectedTemplate.generateHtml(
          firstName || '[First Name]',
          repInfo.name,
          repInfo.phone,
          repInfo.email
        )
      )
    }
  }, [selectedTemplate, firstName, repInfo, isEditing, hasEdits])

  // Reset the editable subject whenever the template changes.
  useEffect(() => {
    setSubject(selectedTemplate.subject)
  }, [selectedTemplate])

  // Turn the email canvas into an editable surface, or capture edits when done.
  const toggleEditMode = () => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    if (!isEditing) {
      doc.designMode = 'on'
      setIsEditing(true)
    } else {
      doc.designMode = 'off'
      setPreviewHtml('<!DOCTYPE html>\n' + doc.documentElement.outerHTML)
      setHasEdits(true)
      setIsEditing(false)
    }
  }

  // Discard any manual edits and restore the original template.
  const resetEdits = () => {
    const doc = iframeRef.current?.contentDocument
    if (doc && doc.designMode === 'on') doc.designMode = 'off'
    setIsEditing(false)
    setHasEdits(false)
    setSubject(selectedTemplate.subject)
    setPreviewHtml(
      selectedTemplate.generateHtml(
        firstName || '[First Name]',
        repInfo.name,
        repInfo.phone,
        repInfo.email
      )
    )
  }

  const loadData = async () => {
    const supabase = createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Get user profile for rep info
    const { data: profile } = await supabase
      .from('users')
      .select('id, first_name, last_name, phone, email')
      .eq('auth_id', user.id)
      .single()

    if (profile) {
      setUserId(profile.id)
      setRepInfo({
        name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Your Rep',
        phone: profile.phone || '800-605-5597',
        email: profile.email || ''
      })
    }

    // Fetch email accounts
    const { data: accountsData } = await supabase
      .from('email_accounts')
      .select('*, email_domains(*)')
      .eq('user_id', profile?.id || user.id)
      .eq('is_deleted', false)
      .order('is_primary', { ascending: false })

    if (accountsData && accountsData.length > 0) {
      setAccounts(accountsData)
      const primary = accountsData.find(a => a.is_primary) || accountsData[0]
      setSelectedAccount(primary)
    }

    setLoading(false)
  }

  const handleSend = async () => {
    if (!selectedAccount || !email || !firstName) {
      setError('Please fill in all required fields')
      return
    }

    setSending(true)
    setError(null)

    try {
      const supabase = createClient()

      // Check if lead exists with this email
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('email', email.toLowerCase())
        .eq('is_deleted', false)
        .single()

      let leadId = existingLead?.id

      // If no lead exists, create one
      if (!leadId) {
        const response = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: firstName,
            last_name: lastName,
            email: email.toLowerCase(),
            source_type: 'outbound_call',
            owner_id: userId,
          }),
        })

        if (response.ok) {
          const { lead } = await response.json()
          leadId = lead?.id
        }
      }

      // Capture the email HTML — if the user customized the canvas, send exactly
      // what's on it; otherwise generate a fresh copy from the template.
      const canvasDoc = iframeRef.current?.contentDocument
      if (canvasDoc && canvasDoc.designMode === 'on') canvasDoc.designMode = 'off'
      const usingEditedCanvas = (hasEdits || isEditing) && !!canvasDoc

      const bodyHtml = usingEditedCanvas
        ? '<!DOCTYPE html>\n' + canvasDoc!.documentElement.outerHTML
        : selectedTemplate.generateHtml(firstName, repInfo.name, repInfo.phone, repInfo.email)

      // Generate plain text based on selected template
      let bodyText: string
      if (selectedTemplate.id === 'annuity-awareness') {
        bodyText = `Hi ${firstName},\n\nIt was great chatting with you earlier about annuities and retirement income planning. I wanted to share a quick visual that breaks down how annuities are structured and what many investors don't realize until after they've signed.\n\nBelow is a simple comparison highlighting how annuities work versus other asset classes.\n\nMany investors choose annuities for perceived safety, but that safety often comes with caps, surrender periods, and limited liquidity. Understanding how commissions, lock-up periods, and participation limits function is key before committing long-term capital.\n\nI've also attached our full Annuity Guide, where we compare annuities vs. other asset classes in more detail, so you can review everything at your own pace. Once you've had a chance to look it over, I'm happy to talk through what might make sense based on your goals.\n\nLooking forward to continuing the conversation,\n${repInfo.name}\nVoice Alchemy Academy\n${repInfo.phone}`
      } else if (selectedTemplate.id === 'bond-market') {
        bodyText = `Hi ${firstName},\n\nIt was great chatting with you earlier about the bond market and current interest rate conditions. I wanted to share a quick visual that highlights what's happening in today's bond environment and why many investors are reassessing traditional fixed-income strategies.\n\nBelow is a snapshot comparing long-term bond performance versus gold over a 10-year period.\n\nWhile bonds have historically been viewed as "safe," rising yields, expanding debt issuance, and inflation pressures are creating both price risk and confidence risk. Long-term bonds in particular have been more vulnerable during periods of fiscal uncertainty and rate volatility.\n\nI've also attached our full Bond Market Update, where we break down the current risks and outline why many investors are diversifying into hard assets. Once you've had a chance to review it, I'm happy to talk through what might make sense based on your goals.\n\nLooking forward to continuing the conversation,\n${repInfo.name}\nVoice Alchemy Academy\n${repInfo.phone}`
      } else if (selectedTemplate.id === 'metals-comparison') {
        bodyText = `Hi ${firstName},\n\nIt was great chatting with you earlier about your interest in gold and precious metals. I wanted to actually share a quick visual that shows how metals have performed compared to traditional investments.\n\nBelow is a comparison of precious metals versus other major asset classes over the past 20 years.\n\nMany investors use metals not for speculation, but for stability and diversification. Historically, gold has often moved independently from the stock market, which can help balance risk in a broader portfolio.\n\nI've also attached our full Precious Metals Investment Guide so you can review everything at your own pace. Once you've had a chance to look it over, I'm happy to talk through what might make sense based on your goals.\n\nLooking forward to continuing the conversation,\n${repInfo.name}\nVoice Alchemy Academy\n${repInfo.phone}`
      } else if (selectedTemplate.id === 'wire-transfer') {
        bodyText = `Dear ${firstName},\n\nThank you for choosing Voice Alchemy Academy for your Precious Metals Investment. Below are the wire transfer details to complete your purchase.\n\nVoice Alchemy Academy, LLC bank accounts are held with Wells Fargo Bank, N.A.\n\nWIRE TRANSFER INFORMATION:\n\nBank Name: Wells Fargo Bank\nBank Address: 420 Montgomery St. San Francisco, CA, 94104\nBank Phone Number: (888) 384-8400\nABA/Routing Number: 121000248\nAccount Name: Voice Alchemy Academy LLC\nAccount Number: 5259127743\nAccount Address: 10433 Wilshire Blvd. #1002 Los Angeles, CA, 90024\nPhone: (310)-209-8166\nWebsite: www.voicealchemyacademy.com\nSWIFT Code: WFIBUS6S\n\nPlease ensure all details are correctly entered to avoid processing delays. If you need assistance, contact us at (310)-209-8166 or IRA@voicealchemyacademy.com.\n\nSincerely,\n${repInfo.name}\nVoice Alchemy Academy\n${repInfo.phone}`
      } else if (selectedTemplate.id === 'check-payment') {
        bodyText = `Dear ${firstName},\n\nThank you for choosing Voice Alchemy Academy for your Precious Metals Investment. To complete your purchase via physical check, please follow the instructions below to ensure your payment is processed accurately and your order is finalized promptly.\n\nVoice Alchemy Academy, LLC accepts personal, cashier's, and business checks. Please note that orders paid by check may be subject to a holding period (typically 5–10 business days) for funds to clear before your metals are released for shipment.\n\nCHECK PAYMENT INFORMATION:\n\nPlease make your check payable to: Voice Alchemy Academy\n\nIf you need further assistance or have questions regarding the mailing process, please reach out to your broker directly or contact us at (310) 209-8166.\n\nWe appreciate your business and look forward to finalizing your transaction.\n\nSincerely,\n${repInfo.name}\nVoice Alchemy Academy\n${repInfo.phone}`
      } else if (selectedTemplate.id === 'order-confirmation') {
        bodyText = `Dear ${firstName},\n\nCongratulations on taking an important step toward strengthening and diversifying your financial future.\n\nYour paperwork and payment have been successfully received by Voice Alchemy Academy. Our team is now preparing your order.\n\nHERE'S EXACTLY WHAT HAPPENS NEXT:\n\nSTEP 1 — PAYMENT PROCESSING\nYour payment must first complete processing.\n• Wire transfers: 1 business day\n• Checks: 5–7 business days to clear\n\nSTEP 2 — QUALITY CONTROL & ORDER PREPARATION\nYour metals are retrieved from secure storage and inspected by our team to ensure proper quality and order accuracy.\nTimeframe: 5–7 business days\n\nSTEP 3 — SHIPPING CARRIER ASSIGNMENT\nOnce your metals pass inspection, a secure shipping carrier is assigned to your order.\nYou will receive shipment confirmation when this is complete.\n\nSTEP 4 — ORDER SHIPMENT\nYour metals are professionally packaged and shipped via secure carrier.\nTracking information will be provided when your order leaves our facility.\n\nSTEP 5 — ORDER DELIVERY — COMPLETE!\nYour metals arrive at your address and your order is complete.\nYou now officially own and possess your physical precious metals.\n\nQuestions? Our team is always available to assist you. Simply reply to this email or call us directly.\n\nWe appreciate the trust you have placed in Voice Alchemy Academy and look forward to serving you for many years to come.\n\nWarm regards,\n${repInfo.name}\nVoice Alchemy Academy\n${repInfo.phone}`
      } else if (selectedTemplate.id === 'cd-guide') {
        bodyText = `Hi ${firstName},\n\nIt was great chatting with you earlier about your CDs and savings. I wanted to share something that many investors find eye-opening when evaluating traditional "safe" investments.\n\nWhile CDs offer a fixed interest rate, they often don't keep pace with inflation. At 4-6% annual inflation, a 3-4% CD yield means your purchasing power is actually declining — even though your balance looks stable.\n\nGold, on the other hand, has historically served as a store of value that protects purchasing power during inflationary periods. It requires no management, carries no counterparty risk, and isn't subject to bank policies or early withdrawal penalties.\n\nI've attached our full guide comparing CDs to gold so you can review the details at your own pace. Once you've had a chance to look it over, I'm happy to discuss what might make sense for your situation.\n\nLooking forward to continuing the conversation,\n${repInfo.name}\nVoice Alchemy Academy\n${repInfo.phone}`
      } else if (selectedTemplate.id === 'gold-vs-realestate') {
        bodyText = `Hi ${firstName},\n\nIt was great chatting with you earlier about your real estate holdings. I wanted to share a quick comparison that many property investors find valuable when evaluating their overall portfolio.\n\nWhile real estate can build wealth over time, it comes with significant carrying costs — mortgage interest, property taxes, insurance, maintenance, and management fees. These expenses can meaningfully reduce your net returns, especially when markets soften.\n\nGold offers a different approach: no tenants, no repairs, no property taxes, and no ongoing management. It's liquid, portable, and has historically preserved wealth through economic uncertainty. Over the past decade, gold has actually outperformed real estate in total returns.\n\nI've attached our full Gold vs Real Estate guide so you can see the detailed comparison. Once you've had a chance to review it, I'd love to discuss how gold might complement your current holdings.\n\nLooking forward to continuing the conversation,\n${repInfo.name}\nVoice Alchemy Academy\n${repInfo.phone}`
      } else if (selectedTemplate.id === 'gold-vs-cash-guide') {
        bodyText = `Hi ${firstName},\n\nIt was great chatting with you earlier about your savings strategy. I wanted to share something that helps illustrate why holding cash long-term can be more costly than it appears.\n\nCash feels safe because the number in your account stays the same. But at 4-6% annual inflation, your purchasing power is quietly eroding every year. Over the past decade, the dollar has lost roughly 35% of its buying power — while gold has increased by nearly 300%.\n\nUnlike currency, gold cannot be printed or diluted through policy decisions. Its supply grows slowly, and it has served as a store of value through recessions, wars, and currency devaluations throughout history.\n\nI've attached our comprehensive Gold vs Cash guide that breaks down the comparison in detail. Once you've had a chance to review it, I'd be happy to discuss how gold might help protect a portion of your savings.\n\nLooking forward to continuing the conversation,\n${repInfo.name}\nVoice Alchemy Academy\n${repInfo.phone}`
      } else if (selectedTemplate.id === 'review-request') {
        bodyText = `Hi ${firstName},\n\nThank you again for choosing Voice Alchemy Academy. It was truly a pleasure working with you, and we're grateful for the opportunity to be part of your journey.\n\nWe take a great deal of pride in delivering a thoughtful, transparent experience — and your feedback helps others feel confident when making important financial decisions.\n\nIf you're open to it, we would sincerely appreciate you sharing your experience:\n\n• Google Reviews: https://www.google.com/search?kgmid=/g/11ybywn636&hl=en-US&q=Citadel+Gold#lrd=0xf26264975d84705:0x981229be97f13f9a,1\n• Better Business Bureau: https://www.bbb.org/us/ca/inglewood/profile/precious-metal-dealers/citadel-gold-1216-1000042667/leave-a-review\n\nYour words make a meaningful difference, and we're incredibly thankful for your time.\n\nIf there's ever anything more we can assist you with, please don't hesitate to reach out.\n\nWarm regards,\n${repInfo.name}\nVoice Alchemy Academy\n${repInfo.phone}`
      } else {
        bodyText = `Hi ${firstName},\n\nIt was great chatting with you earlier about your retirement savings and the cash you're currently holding. I wanted to give you something visual that helps put that into perspective.\n\nWhat surprises many people is that while cash doesn't fluctuate, its purchasing power steadily declines over time due to inflation. Gold, on the other hand, has historically been used as a store of value during economic uncertainty and rising costs.\n\nThis isn't about replacing everything — it's about protecting and diversifying a portion of what you've worked hard to build.\n\nI also attached our full Precious Metals Investment Guide in case you'd like to explore the topic in more detail. When you've had a chance to look things over, I'm happy to answer any questions.\n\nTalk soon,\n${repInfo.name}\nVoice Alchemy Academy\n${repInfo.phone}`
      }

      // If the canvas was edited, derive the plain-text version from it so the
      // two bodies stay in sync with what the rep actually wrote.
      if (usingEditedCanvas && canvasDoc?.body) {
        bodyText = (canvasDoc.body.innerText || '').replace(/\n{3,}/g, '\n\n').trim()
      }

      // Send the email
      const sendResponse = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_account_id: selectedAccount.id,
          to: [email],
          subject: subject.trim() || selectedTemplate.subject,
          body_html: bodyHtml,
          body_text: bodyText,
          lead_id: leadId,
        }),
      })

      if (!sendResponse.ok) {
        const err = await sendResponse.json()
        throw new Error(err.error || 'Failed to send email')
      }

      setSuccess(true)
      // Reset form for next send
      setFirstName('')
      setLastName('')
      setEmail('')
      setIsEditing(false)
      setHasEdits(false)
      setSubject(selectedTemplate.subject)
    } catch (err: any) {
      setError(err.message || 'Failed to send email')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-6 border-b border-white/10 bg-white/5 backdrop-blur-sm">
          <h1 className="text-2xl font-light text-white flex items-center gap-3">
            <Zap className="w-6 h-6 text-yellow-400" />
            Quick Send
          </h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-white/60">Loading...</div>
        </div>
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-6 border-b border-white/10 bg-white/5 backdrop-blur-sm">
          <h1 className="text-2xl font-light text-white flex items-center gap-3">
            <Zap className="w-6 h-6 text-yellow-400" />
            Quick Send
          </h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-white/60 p-8">
          <Mail className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-xl mb-2">No email accounts connected</p>
          <p className="text-sm text-center">Please connect an email account in Email Settings to use Quick Send.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex">
      {/* Left Panel - Form */}
      <div className="w-[400px] flex flex-col border-r border-white/10 bg-white/5 backdrop-blur-sm">
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <h1 className="text-2xl font-light text-white flex items-center gap-3">
            <Zap className="w-6 h-6 text-yellow-400" />
            Quick Send
          </h1>
          <p className="text-sm text-white/60 mt-1">
            Send templated emails after calls
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Success Message */}
          {success && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
              <div>
                <p className="text-green-400 font-medium">Email sent!</p>
                <p className="text-sm text-green-400/70">Ready to send another.</p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {/* Template Selection with Accordions */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-white/70 mb-2">Template</label>
            <div className="space-y-3">
              {templateCategories.map((category) => {
                const isExpanded = expandedCategories.includes(category.id)
                const CategoryIcon = category.icon
                const hasSelectedTemplate = category.templates.some(t => t.id === selectedTemplate?.id)

                return (
                  <div key={category.id} className="rounded-xl border border-white/20 overflow-hidden">
                    {/* Accordion Header */}
                    <button
                      onClick={() => {
                        setExpandedCategories(prev =>
                          prev.includes(category.id)
                            ? prev.filter(id => id !== category.id)
                            : [...prev, category.id]
                        )
                      }}
                      className={`w-full p-3 flex items-center justify-between transition-colors ${
                        hasSelectedTemplate ? 'bg-yellow-500/10' : 'bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <CategoryIcon className={`w-4 h-4 ${hasSelectedTemplate ? 'text-yellow-400' : 'text-white/60'}`} />
                        <span className={`font-medium ${hasSelectedTemplate ? 'text-yellow-400' : 'text-white'}`}>
                          {category.name}
                        </span>
                        <span className="text-xs text-white/40">({category.templates.length})</span>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-white/60 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Accordion Content */}
                    {isExpanded && (
                      <div className="border-t border-white/10">
                        {category.templates.map((template) => (
                          <button
                            key={template.id}
                            onClick={() => {
                              setSelectedTemplate(template)
                              setSuccess(false)
                              setError(null)
                              setIsEditing(false)
                              setHasEdits(false)
                            }}
                            className={`w-full p-3 pl-9 text-left transition-all border-b border-white/5 last:border-b-0 ${
                              selectedTemplate?.id === template.id
                                ? 'bg-yellow-500/15'
                                : 'hover:bg-white/5'
                            }`}
                          >
                            <p className={`font-medium text-sm ${
                              selectedTemplate?.id === template.id ? 'text-yellow-400' : 'text-white'
                            }`}>
                              {template.name}
                            </p>
                            <p className="text-xs text-white/50 mt-0.5">{template.description}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Contact Details */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-white/70 mb-3">Contact Details</label>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">
                    First Name <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => {
                        setFirstName(e.target.value)
                        setSuccess(false)
                      }}
                      placeholder="John"
                      className="w-full pl-10 pr-3 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-yellow-500/50 focus:bg-white/15 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Smith"
                    className="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-yellow-500/50 focus:bg-white/15 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5">
                  Email Address <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      setSuccess(false)
                    }}
                    placeholder="john@example.com"
                    className="w-full pl-10 pr-3 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-yellow-500/50 focus:bg-white/15 text-sm"
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-white/40 mt-3">
              New contacts are automatically added as leads.
            </p>
          </div>

          {/* From Account */}
          {accounts.length > 1 && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-white/70 mb-2">Send From</label>
              <select
                value={selectedAccount?.id || ''}
                onChange={(e) => {
                  const account = accounts.find(a => a.id === e.target.value)
                  setSelectedAccount(account || null)
                }}
                className="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-yellow-500/50 text-sm"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.email_address} {account.is_primary && '(Primary)'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Helper text when preview not shown */}
          {!showPreview && (
            <div className="flex items-center gap-2 text-white/50 text-sm">
              <ArrowRight className="w-4 h-4" />
              <span>Enter contact details to see preview</span>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Preview */}
      <div className="flex-1 flex flex-col">
        {showPreview ? (
          <>
            {/* Preview Header */}
            <div className="p-4 border-b border-white/10 bg-white/5 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white/60">
                    To: {firstName} {lastName} &lt;{email}&gt;
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-white/40 flex-shrink-0">Subject</span>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="flex-1 min-w-0 bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-yellow-500/50"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {(hasEdits || isEditing) && (
                    <button
                      onClick={resetEdits}
                      className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-white/70 hover:text-white rounded-xl hover:bg-white/10 transition-all"
                      title="Discard edits and restore the template"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Reset
                    </button>
                  )}
                  <button
                    onClick={toggleEditMode}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-xl transition-all ${
                      isEditing
                        ? 'bg-green-500/20 text-green-300 border border-green-500/40 hover:bg-green-500/30'
                        : 'bg-white/10 text-white border border-white/20 hover:bg-white/15'
                    }`}
                  >
                    {isEditing ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                    {isEditing ? 'Done' : 'Edit'}
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={sending}
                    className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-black rounded-xl transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                    style={{
                      background: 'linear-gradient(135deg, #ffd700 0%, #ffec8b 20%, #daa520 50%, #b8860b 80%, #cd853f 100%)',
                    }}
                  >
                    <Send className="w-4 h-4" />
                    {sending ? 'Sending...' : 'Send Email'}
                  </button>
                </div>
              </div>
              {isEditing && (
                <p className="mt-2 text-xs text-yellow-300/80">
                  Editing mode on — click directly in the email to change any text. Click Done when finished.
                </p>
              )}
              {hasEdits && !isEditing && (
                <p className="mt-2 text-xs text-white/40">
                  This email has custom edits. Reset to restore the original template.
                </p>
              )}
            </div>

            {/* Preview Content */}
            <div className="flex-1 overflow-auto bg-white/10 p-4">
              <div className="max-w-2xl mx-auto">
                <iframe
                  ref={iframeRef}
                  srcDoc={previewHtml}
                  className={`w-full h-[900px] bg-white rounded-lg shadow-xl ${
                    isEditing ? 'ring-2 ring-yellow-400/70' : ''
                  }`}
                  title="Email Preview"
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-white/50">
            <Mail className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg">Email Preview</p>
            <p className="text-sm mt-1">Enter first name and email to see preview</p>
          </div>
        )}
      </div>
    </div>
  )
}
