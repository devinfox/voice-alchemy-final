import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import sharp from 'sharp'


// Force dynamic rendering for file uploads
export const dynamic = 'force-dynamic'

// Max width for email images (600px is standard email width)
const MAX_IMAGE_WIDTH = 800
// Target file size in KB (aim for under 200KB for fast email loading)
const TARGET_FILE_SIZE_KB = 200

async function optimizeImage(buffer: Buffer, mimeType: string): Promise<{ buffer: Buffer; mimeType: string }> {
  try {
    let sharpInstance = sharp(buffer)
    const metadata = await sharpInstance.metadata()

    // Only resize if image is wider than max width
    if (metadata.width && metadata.width > MAX_IMAGE_WIDTH) {
      sharpInstance = sharpInstance.resize(MAX_IMAGE_WIDTH, null, {
        withoutEnlargement: true,
        fit: 'inside',
      })
    }

    // For PNG with transparency, keep as PNG but optimize
    if (mimeType === 'image/png') {
      const optimized = await sharpInstance
        .png({
          compressionLevel: 9,
          palette: true,
          quality: 80,
        })
        .toBuffer()

      // If still too large, convert to JPEG (loses transparency but much smaller)
      if (optimized.length > TARGET_FILE_SIZE_KB * 1024 * 2) {
        const jpegBuffer = await sharp(buffer)
          .resize(MAX_IMAGE_WIDTH, null, { withoutEnlargement: true, fit: 'inside' })
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .jpeg({ quality: 85, mozjpeg: true })
          .toBuffer()

        return { buffer: jpegBuffer, mimeType: 'image/jpeg' }
      }

      return { buffer: optimized, mimeType: 'image/png' }
    }

    // For JPEG and other formats, convert to optimized JPEG
    if (mimeType === 'image/jpeg' || mimeType === 'image/webp') {
      const optimized = await sharpInstance
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer()

      return { buffer: optimized, mimeType: 'image/jpeg' }
    }

    // For GIF, keep as-is (Sharp doesn't handle animated GIFs well)
    if (mimeType === 'image/gif') {
      return { buffer, mimeType }
    }

    // Default: convert to JPEG
    const optimized = await sharpInstance
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer()

    return { buffer: optimized, mimeType: 'image/jpeg' }
  } catch (error) {
    console.error('Image optimization failed, using original:', error)
    return { buffer, mimeType }
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''

    let fileBuffer: Buffer
    let fileType: string
    let fileName: string

    // Handle JSON with base64 (more reliable through proxies)
    if (contentType.includes('application/json')) {
      const body = await request.json()
      const { data, type, name } = body

      if (!data || !type) {
        return NextResponse.json(
          { error: 'Missing data or type in request body' },
          { status: 400 }
        )
      }

      // Decode base64
      const base64Data = data.replace(/^data:image\/\w+;base64,/, '')
      fileBuffer = Buffer.from(base64Data, 'base64')
      fileType = type
      fileName = name || 'image.jpg'
    }
    // Handle FormData (traditional approach)
    else if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const fileEntry = formData.get('file')

      if (!fileEntry || typeof fileEntry === 'string') {
        return NextResponse.json(
          { error: 'No file provided' },
          { status: 400 }
        )
      }

      const file = fileEntry as File
      fileType = file.type || ''
      fileName = file.name || 'image.jpg'

      const arrayBuffer = await file.arrayBuffer()
      fileBuffer = Buffer.from(arrayBuffer)
    }
    else {
      return NextResponse.json(
        { error: 'Unsupported content type. Use JSON with base64 or multipart/form-data' },
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(fileType)) {
      return NextResponse.json(
        { error: `Invalid file type '${fileType}'. Allowed: JPEG, PNG, GIF, WebP` },
        { status: 400 }
      )
    }

    // Validate file size (max 5MB before optimization)
    const maxSize = 5 * 1024 * 1024
    if (fileBuffer.length > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5MB' },
        { status: 400 }
      )
    }

    // Optimize image for email
    const originalSize = fileBuffer.length
    const { buffer: optimizedBuffer, mimeType: optimizedMimeType } = await optimizeImage(fileBuffer, fileType)
    const optimizedSize = optimizedBuffer.length

    console.log(`Image optimized: ${(originalSize / 1024).toFixed(1)}KB -> ${(optimizedSize / 1024).toFixed(1)}KB (${((1 - optimizedSize / originalSize) * 100).toFixed(0)}% reduction)`)

    // Generate unique filename with correct extension
    const ext = optimizedMimeType === 'image/jpeg' ? 'jpg' : optimizedMimeType.split('/')[1]
    const uniqueFilename = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${ext}`

    // Upload optimized image to Supabase Storage
    const { data, error } = await getSupabaseAdmin().storage
      .from('email-images')
      .upload(uniqueFilename, optimizedBuffer, {
        contentType: optimizedMimeType,
        upsert: false,
      })

    if (error) {
      console.error('Upload error:', error)

      if (error.message.includes('Bucket not found')) {
        return NextResponse.json(
          {
            error: 'Storage bucket not configured. Please create an "email-images" bucket in Supabase.',
            details: error.message
          },
          { status: 500 }
        )
      }

      return NextResponse.json(
        { error: 'Failed to upload image', details: error.message },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: urlData } = getSupabaseAdmin().storage
      .from('email-images')
      .getPublicUrl(uniqueFilename)

    return NextResponse.json({
      url: urlData.publicUrl,
      path: data.path,
    })
  } catch (error) {
    console.error('Image upload error:', error)
    return NextResponse.json(
      {
        error: 'Failed to process upload',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
