from django.core.mail import send_mail
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from django.conf import settings
import secrets

def generate_verification_token(user):
    """Generate a unique verification token"""
    return secrets.token_urlsafe(32)

def send_verification_email(request, user, token):
    """Send verification email to user"""
    # Build verification link
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    verification_link = f"{request.scheme}://{request.get_host()}/verify/{uid}/{token}/"
    
    # Email subject
    subject = "Verify your email for Worklytics"
    
    # Plain text version
    text_message = f"""
Welcome to Worklytics!

Hello,

Thank you for registering with Worklytics. Please click the link below to verify your email address and activate your account:

{verification_link}

This verification link will expire in 24 hours.

Once verified, your account will be sent to an admin for approval. You'll receive another email once your account is approved.

If you didn't register for Worklytics, please ignore this email.

Best regards,
The Worklytics Team
"""
    
    # HTML version
    html_message = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{
            font-family: 'Segoe UI', Arial, sans-serif;
            line-height: 1.6;
            color: #333333;
            margin: 0;
            padding: 0;
            background-color: #f4f8ff;
        }}
        .container {{
            max-width: 600px;
            margin: 20px auto;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }}
        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px 20px;
            text-align: center;
        }}
        .header h1 {{
            margin: 0;
            font-size: 32px;
            font-weight: 600;
        }}
        .content {{
            padding: 40px 30px;
            background: white;
        }}
        .button {{
            display: inline-block;
            padding: 14px 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 500;
            font-size: 16px;
            margin: 20px 0;
        }}
        .note {{
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            font-size: 14px;
            color: #666;
            border-left: 4px solid #667eea;
        }}
        .footer {{
            background: #f4f8ff;
            padding: 20px;
            text-align: center;
            font-size: 14px;
            color: #6b7a99;
            border-top: 1px solid #e0e7ff;
        }}
        .expiry {{
            font-size: 13px;
            color: #dc3545;
            margin-top: 15px;
            padding: 10px;
            background: #fff3f3;
            border-radius: 6px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✨ Worklytics</h1>
            <p style="margin: 10px 0 0; opacity: 0.9;">Intelligent Workload Analysis & Project Planning</p>
        </div>
        
        <div class="content">
            <h2 style="color: #1f2a44; margin-top: 0;">Welcome to Worklytics!</h2>
            
            <p>Hello <strong>{user.email}</strong>,</p>
            
            <p>Thank you for registering with Worklytics. We're excited to have you on board! To get started, please verify your email address by clicking the button below:</p>
            
            <div style="text-align: center;">
                <a href="{verification_link}" class="button">✓ Verify Email Address</a>
            </div>
            
            <div class="note">
                <p style="margin: 0;"><strong>🔔 What happens next?</strong></p>
                <p style="margin: 10px 0 0;">After verification, your account will be reviewed by an admin. You'll receive another email once your account is approved and you can access your dashboard.</p>
            </div>
            
            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="background: #f4f8ff; padding: 10px; border-radius: 6px; word-break: break-all; font-size: 14px;">{verification_link}</p>
            
            <div class="expiry">
                ⏰ This verification link will expire in 24 hours.
            </div>
            
            <p>If you didn't create an account with Worklytics, please ignore this email.</p>
            
            <p style="margin-top: 30px;">Best regards,<br>
            <strong>The Worklytics Team</strong></p>
        </div>
        
        <div class="footer">
            <p>© 2026 Worklytics. All rights reserved.</p>
            <p style="margin-top: 10px;">
                <small>This is an automated message, please do not reply to this email.</small>
            </p>
        </div>
    </div>
</body>
</html>
"""
    
    # Send email
    try:
        send_mail(
            subject=subject,
            message=text_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            html_message=html_message,
            fail_silently=False,
        )
        print(f"✅ Verification email sent to {user.email}")
        return True
    except Exception as e:
        print(f"❌ Failed to send email: {str(e)}")
        return False