# Pocket Skill Troubleshooting

- Cyrillic/Unicode pocket names fail in cat-file/ls-tree → git core.quotepath octal escapes non-ASCII bytes → pass -c core.quotepath=false in gitExec.
