import { describe, it, expect } from 'vitest';
import { entitlementFromClaims, FREE, PRO_ROLE } from '../src/lib/entitlement';

describe('entitlementFromClaims', () => {
  it('grants Pro when the stripeRole claim matches PRO_ROLE', () => {
    expect(entitlementFromClaims({ stripeRole: PRO_ROLE })).toEqual({ pro: true });
  });

  it('denies Pro for a different role', () => {
    expect(entitlementFromClaims({ stripeRole: 'basic' })).toEqual({ pro: false });
  });

  it('denies Pro when the claim is absent', () => {
    expect(entitlementFromClaims({ someOther: 1 })).toEqual({ pro: false });
  });

  it('fails closed on null / undefined claims', () => {
    expect(entitlementFromClaims(null)).toEqual(FREE);
    expect(entitlementFromClaims(undefined)).toEqual(FREE);
  });
});
