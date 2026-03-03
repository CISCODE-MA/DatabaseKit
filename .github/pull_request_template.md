# Summary

- What does this PR change?

## Why

- Why is this change needed?
- Does this address a specific issue?

## Type of Change

- [ ] 🐛 Bug fix (non-breaking)
- [ ] ✨ New feature (non-breaking)
- [ ] 🔄 Refactor (no behavior change)
- [ ] 📚 Documentation
- [ ] 🔐 Security improvement
- [ ] 💥 Breaking change

## Testing

- [ ] Added unit tests
- [ ] Added integration tests
- [ ] Tested locally with both MongoDB and PostgreSQL adapters
- [ ] Tested with real connection pooling

## Checklist

- [ ] `npm run lint` passes
- [ ] `npm run format` passes
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run test:cov` maintains or improves coverage (>80%)
- [ ] `npm run build` passes
- [ ] Added a changeset (`npx changeset`) if this affects consumers
- [ ] Updated README if adding new features
- [ ] Updated JSDoc/TSDoc if changing public APIs
- [ ] No hardcoded credentials or sensitive data

## Database Testing

- [ ] Tested with MongoDB adapter
- [ ] Tested with PostgreSQL adapter
- [ ] Tested with connection pooling enabled
- [ ] Verified error handling and sanitization

## Security

- [ ] No parameterized query vulnerabilities
- [ ] No exposed connection strings
- [ ] Error messages sanitized (no internal details)
- [ ] Dependencies audited (`npm audit`)

## Notes

- Anything reviewers should pay attention to?
- Any known limitations?
- Any follow-up tasks needed?
