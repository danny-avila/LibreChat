#!/usr/bin/env python3
"""
PII Remover using scrubadub

This script removes all Personally Identifiable Information (PII) from text
using the scrubadub library. It supports various PII types including names, emails,
phone numbers, addresses, credit card numbers, and more.
"""

import sys
import json

try:
    import scrubadub
    from scrubadub import Scrubber
    SCRUBADUB_AVAILABLE = True
except ImportError as e:
    print(json.dumps({"error": f"scrubadub library is not available: {e}. Please install it using: pip install scrubadub"}), file=sys.stderr)
    SCRUBADUB_AVAILABLE = False
except Exception as e:
    print(json.dumps({"error": f"scrubadub library has compatibility issues: {e}"}), file=sys.stderr)
    SCRUBADUB_AVAILABLE = False


def create_company_name_detector():
    """
    Create a custom detector for company and organization names.
    Detects patterns like:
    - Company Inc., Corporation, LLC, Ltd, Corp, etc.
    - Capitalized words that might be company names
    - Common business entity suffixes
    """
    import re
    from scrubadub.detectors.base import Detector
    from scrubadub.filth import Filth
    
    class CompanyNameFilth(Filth):
        type = 'company_name'
        
        @property
        def replacement(self):
            """Return the replacement text for company names."""
            return '{{COMPANY_NAME}}'
    
    class CompanyNameDetector(Detector):
        filth_type = 'company_name'
        
        def iter_filth(self, text, document_name=None):
            """Detect company names in text."""
            import sys
            # Debug: log that detector is being called
            print(f"[DEBUG] CompanyNameDetector.iter_filth called with text length: {len(text)}", file=sys.stderr)
            print(f"[DEBUG] First 200 chars: {text[:200]}", file=sys.stderr)
            
            # Pattern 1: Company names with suffixes (Inc., Corp., LLC, Ltd, etc.)
            # This is the most reliable pattern - catches "Wahed Inc.", "ABC Corporation", etc.
            # Handles both "Wahed Inc." and "WAHED INC." (all caps)
            # Only match common business entity suffixes, not generic words like "Company" or "Corporation" alone
            company_suffixes = r'(Inc\.?|Corp\.?|LLC|L\.L\.C\.?|Ltd\.?|Limited|Co\.?|Incorporated|LP|L\.P\.?|LLP|L\.L\.P\.?|PC|P\.C\.?|PLLC|P\.L\.L\.C\.?)'
            
            # Pattern for company name with suffix: "CompanyName Inc." or "Company Name Corp."
            # Handles: "Wahed Inc.", "WAHED INC.", "ABC Corporation", etc.
            # Match company name (1-3 words) followed by suffix, with optional punctuation after
            # IMPORTANT: Don't match across newlines - use [^\n] to restrict to single line
            # Pattern 1: Normal case like "Wahed Inc." or "Wahed Inc"
            # Require the company name to be a proper noun (starts with capital, followed by lowercase)
            company_with_suffix = r'(?<![A-Za-z])([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+' + company_suffixes + r'(?=\s|$|\.|,|;|:)'
            # Pattern 2: All-caps like "WAHED INC." or "WAHED INC" - use case-insensitive matching
            # Word boundary doesn't work well with all-caps, so use lookbehind/lookahead
            # Require at least 2 uppercase letters for the company name
            company_with_suffix_allcaps = r'(?<![A-Za-z])([A-Z]{2,}(?:\s+[A-Z]{2,}){0,2})\s+(INC\.?|CORP\.?|LLC|LTD\.?|LIMITED|CO\.?|INCORPORATED)(?=\s|$|\.|,|;|:)'
            # Pattern 3: Mixed case with all-caps company name like "WAHED Inc."
            company_with_suffix_mixed = r'(?<![A-Za-z])([A-Z]{2,}(?:\s+[A-Z]{2,}){0,2})\s+(Inc\.?|Corp\.?|LLC|Ltd\.?)(?=\s|$|\.|,|;|:)'
            
            # REMOVED: "The CompanyName" pattern - too broad, matches "the Company", "the Investors", etc.
            # REMOVED: Standalone capitalized company names - too broad
            # REMOVED: Single-word company names - too broad
            
            found_matches = set()
            found_positions = set()  # Track positions to avoid overlapping matches
            
            # Only match company names with suffixes - this is the most reliable pattern
            # Try all patterns: normal case, all-caps, and mixed
            # Use case-insensitive for all-caps pattern to catch "WAHED INC." and "Wahed Inc."
            patterns_with_flags = [
                (company_with_suffix, 0),  # No flags needed - pattern handles word boundaries
                (company_with_suffix_allcaps, re.IGNORECASE),
                (company_with_suffix_mixed, 0),
            ]
            
            for pattern, flags in patterns_with_flags:
                for match in re.finditer(pattern, text, flags):
                    company_name = match.group(1)  # Just the name part, without suffix
                    full_match = match.group(0)  # Full match including suffix
                    
                    # Skip if position already covered (check if any part overlaps)
                    start_pos = match.start()
                    end_pos = match.end()
                    if any(pos >= start_pos and pos < end_pos for pos in found_positions):
                        continue
                    
                    # Skip if too short
                    if len(company_name.strip()) < 2:
                        continue
                    
                    # Skip common words that might be matched incorrectly
                    skip_words = ['the', 'a', 'an', 'this', 'that', 'these', 'those', 
                                 'company', 'corporation', 'purchaser', 'investor', 
                                 'board', 'party', 'parties', 'holder', 'founder',
                                 'stock', 'preferred', 'common', 'series', 'term',
                                 'sheet', 'document', 'agreement', 'right', 'voting']
                    if company_name.lower() in skip_words:
                        continue
                    
                    # Skip if it contains common business terms
                    words = company_name.split()
                    skip_business_terms = {'Stock', 'Preferred', 'Common', 'Series', 'Board', 
                                          'Directors', 'Investors', 'Purchasers', 'Certificate',
                                          'Incorporation', 'Governance', 'Documents', 'Rights',
                                          'Agreement', 'Voting', 'Term', 'Sheet', 'Confidential',
                                          'Binding', 'Definitive', 'Section', 'Financing'}
                    if any(word in skip_business_terms for word in words):
                        continue
                    
                    key = (company_name.lower(), start_pos)
                    if key not in found_matches:
                        found_matches.add(key)
                        # Mark all positions in this match as covered
                        for pos in range(start_pos, end_pos):
                            found_positions.add(pos)
                        # Debug: log what we found
                        import sys
                        print(f"[DEBUG] Found company name: '{full_match}' at position {start_pos}-{end_pos}", file=sys.stderr)
                        # Return the full match including suffix for replacement
                        yield CompanyNameFilth(
                            beg=start_pos,
                            end=end_pos,
                            text=full_match,
                        )
    
    return CompanyNameDetector()


def create_scrubber():
    """
    Create and configure a scrubadub Scrubber instance with all available detectors.
    
    Returns:
        Scrubber: Configured scrubber instance
    """
    scrubber = Scrubber()
    
    # Add custom company name detector
    # Note: scrubadub 2.0+ includes default detectors (credit_card, phone, email, etc.) automatically
    # We only need to add our custom detector
    try:
        company_detector = create_company_name_detector()
        scrubber.add_detector(company_detector)
        import sys
        print(f"Successfully added custom company name detector", file=sys.stderr)
    except Exception as e:
        import sys
        import traceback
        print(f"Warning: Could not add custom company name detector: {e}", file=sys.stderr)
        print(f"Traceback: {traceback.format_exc()}", file=sys.stderr)
    
    return scrubber


def remove_pii(text, scrubber=None):
    """
    Remove PII from text using scrubadub.
    
    Args:
        text (str): Input text containing PII
        scrubber (Scrubber, optional): Pre-configured scrubber instance
        
    Returns:
        tuple: (cleaned_text, list_of_removed_items)
    """
    if scrubber is None:
        scrubber = create_scrubber()
    
    try:
        # Get information about what was removed BEFORE cleaning
        removed_items = []
        try:
            # Try different methods to get filth information
            if hasattr(scrubber, 'iter_filth'):
                for match in scrubber.iter_filth(text):
                    removed_items.append({
                        'type': getattr(match, 'filth_type', 'unknown'),
                        'text': getattr(match, 'text', ''),
                        'replacement': getattr(match, 'replacement', '{{' + getattr(match, 'filth_type', 'unknown').upper() + '}}'),
                        'start': getattr(match, 'beg', 0),
                        'end': getattr(match, 'end', 0)
                    })
            elif hasattr(scrubber, 'detect_filth'):
                filth_list = scrubber.detect_filth(text)
                for match in filth_list:
                    removed_items.append({
                        'type': getattr(match, 'filth_type', 'unknown'),
                        'text': getattr(match, 'text', ''),
                        'replacement': getattr(match, 'replacement', '{{' + getattr(match, 'filth_type', 'unknown').upper() + '}}'),
                        'start': getattr(match, 'beg', 0),
                        'end': getattr(match, 'end', 0)
                    })
        except Exception as e:
            # Still return the cleaned text even if we can't get details
            import sys
            print(f"Warning: Could not get filth information: {e}", file=sys.stderr)
            import traceback
            print(f"Traceback: {traceback.format_exc()}", file=sys.stderr)
        
        # Clean the text AFTER getting filth info (so we can see what was detected)
        cleaned_text = scrubber.clean(text)
        
        return cleaned_text, removed_items
        
    except Exception as e:
        raise Exception(f"Failed to clean text with scrubadub: {str(e)}")


def main():
    """Main function for programmatic use - outputs JSON."""
    if not SCRUBADUB_AVAILABLE:
        print(json.dumps({"error": "scrubadub is not available. Please install it and ensure all dependencies are working."}), file=sys.stderr)
        sys.exit(1)
    
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Text input required"}), file=sys.stderr)
        sys.exit(1)
    
    # Read text from stdin if provided as argument, otherwise from file path
    if sys.argv[1] == '--stdin':
        text = sys.stdin.read()
    else:
        # Assume it's a file path
        import os
        file_path = sys.argv[1]
        if not os.path.exists(file_path):
            print(json.dumps({"error": f"File not found: {file_path}"}), file=sys.stderr)
            sys.exit(1)
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                text = f.read()
        except UnicodeDecodeError:
            try:
                with open(file_path, 'r', encoding='latin-1') as f:
                    text = f.read()
            except Exception as e:
                print(json.dumps({"error": f"Failed to read file {file_path}: {str(e)}"}), file=sys.stderr)
                sys.exit(1)
        except Exception as e:
            print(json.dumps({"error": f"Failed to read file {file_path}: {str(e)}"}), file=sys.stderr)
            sys.exit(1)
    
    try:
        # Create scrubber
        scrubber = create_scrubber()
        
        # Remove PII
        cleaned_text, removed_items = remove_pii(text, scrubber)
        
        result = {
            "success": True,
            "cleaned_text": cleaned_text,
            "removed_items": removed_items,
            "removed_count": len(removed_items),
            "original_length": len(text),
            "cleaned_length": len(cleaned_text)
        }
        print(json.dumps(result))
    except Exception as e:
        result = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(result), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

