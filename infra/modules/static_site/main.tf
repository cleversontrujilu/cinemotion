# Um site Nuxt estático: bucket S3 privado (lido só pelo CloudFront via OAC) e uma
# distribuição que serve o site e encaminha /api/* ao API Gateway da sua API.
# Mesma origem para página e API: sem CORS e sem a URL da API no build.

locals {
  mime_types = {
    html  = "text/html; charset=utf-8"
    js    = "text/javascript; charset=utf-8"
    mjs   = "text/javascript; charset=utf-8"
    css   = "text/css; charset=utf-8"
    json  = "application/json; charset=utf-8"
    svg   = "image/svg+xml"
    png   = "image/png"
    jpg   = "image/jpeg"
    jpeg  = "image/jpeg"
    gif   = "image/gif"
    webp  = "image/webp"
    ico   = "image/x-icon"
    woff  = "font/woff"
    woff2 = "font/woff2"
    ttf   = "font/ttf"
    txt   = "text/plain; charset=utf-8"
    xml   = "application/xml"
    map   = "application/json"
  }

  files = fileset(var.source_dir, "**")

  # Arquivos com hash no nome. _nuxt/builds/ fica de fora: latest.json não tem hash
  # e é por ele que o Nuxt percebe que saiu um deploy novo.
  immutable = toset([
    for f in local.files : f
    if(startswith(f, "_nuxt/") || startswith(f, "_fonts/")) && !startswith(f, "_nuxt/builds/")
  ])
}

resource "aws_s3_bucket" "this" {
  bucket_prefix = "${var.name}-"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket                  = aws_s3_bucket.this.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "this" {
  bucket = aws_s3_bucket.this.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Os arquivos de `nuxt generate`. Os com hash no nome ficam em cache para sempre; o resto
# (HTML, payloads, latest.json) é revalidado, então um deploy aparece sem invalidação.
# Arquivos que somem do build são apagados do bucket no apply.
resource "aws_s3_object" "files" {
  for_each = local.files

  bucket        = aws_s3_bucket.this.id
  key           = each.value
  source        = "${var.source_dir}/${each.value}"
  etag          = filemd5("${var.source_dir}/${each.value}")
  content_type  = lookup(local.mime_types, lower(try(regex("\\.([^./]+)$", each.value)[0], "")), "application/octet-stream")
  cache_control = contains(local.immutable, each.value) ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate"
}

resource "aws_cloudfront_origin_access_control" "this" {
  name                              = var.name
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# O site é gerado com /sessao/index.html etc.; a origem S3 não resolve índices de pasta.
resource "aws_cloudfront_function" "index" {
  name    = "${var.name}-index"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = file("${path.module}/index-rewrite.js")
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

# Repassa à API tudo do visitante (Authorization, query, corpo) menos o Host,
# que precisa ser o do API Gateway.
data "aws_cloudfront_origin_request_policy" "all_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  comment             = var.name
  default_root_object = "index.html"
  http_version        = "http2and3"
  is_ipv6_enabled     = true
  price_class         = var.price_class

  origin {
    origin_id                = "site"
    domain_name              = aws_s3_bucket.this.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.this.id
  }

  origin {
    origin_id   = "api"
    domain_name = var.api_domain

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "site"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.index.arn
    }
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "api"
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_except_host.id
  }

  # Sem custom_error_response: ele valeria também para /api/* e trocaria os 404/401
  # em Problem Details da API por uma página HTML.

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

data "aws_iam_policy_document" "bucket" {
  statement {
    sid       = "CloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.this.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }

  # Com ListBucket, arquivo inexistente volta 404 em vez de 403.
  statement {
    sid       = "CloudFrontList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.this.arn]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "this" {
  bucket     = aws_s3_bucket.this.id
  policy     = data.aws_iam_policy_document.bucket.json
  depends_on = [aws_s3_bucket_public_access_block.this]
}
