# A2P 10DLC Campaign Resubmission — CTA Text
## Updated: March 7, 2026

### "How do end-users consent to receive messages?" field:

Opt-in method 1 (Technicians): An authorized business administrator adds technician phone numbers through the FixMyNight admin portal (login-protected dashboard). Screenshots of the admin opt-in interface and full program documentation are published at https://fixmyday.ai/sms. Each technician receives a one-time verification SMS reading: "You have been added as a technician for [Business Name] via FixMyNight. Text ON to go on-call. Text STOP to opt out. Text HELP for help. Msg & data rates may apply." Technicians explicitly opt in by texting the keyword ON to their business's dedicated FixMyNight phone number. No on-call messages are sent until the technician texts ON. Opt-in method 2 (Business Owners): Business owners provide their mobile number and consent to receive service alerts (emergency fallback notifications and morning call summaries) during account setup. Full SMS program details, consent disclosure, message samples, and opt-out instructions are published at https://fixmyday.ai/sms. Terms of Service including SMS terms: https://fixmyday.ai/terms. Privacy Policy: https://fixmyday.ai/privacy. Consent is not a condition of purchase. Message frequency varies based on call volume. Message and data rates may apply. Text STOP to opt out. Text HELP for assistance.

CHARACTER COUNT: ~1,067 (within 2,048 limit)

---

### What changed from the rejected version:
1. Added "login-protected dashboard" to acknowledge why reviewer can't log in
2. Added public URL (fixmyday.ai/sms) with screenshots and full documentation
3. Included the actual verification SMS text so reviewer can see the opt-in message
4. Made it clear no messages are sent until technician texts ON
5. Consolidated all public URLs (sms page, terms, privacy) for easy verification

### Checklist before resubmitting:
- [ ] Deploy the /sms page to fixmyday.ai/sms
- [ ] Upload admin portal screenshot to the /sms page
- [ ] Verify fixmyday.ai/sms loads correctly (test the URL)
- [ ] Verify fixmyday.ai/terms loads correctly
- [ ] Verify fixmyday.ai/privacy loads correctly
- [ ] Fix Messaging Service mismatch: move +19796525799 into MG964517...01b
- [ ] Paste CTA text above into Twilio campaign edit form
- [ ] Resubmit campaign
