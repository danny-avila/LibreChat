(module
 (type $FUNCSIG$dd (func (param f64) (result f64)))
 (import "env" "exp" (func $exp (param f64) (result f64)))
 (import "env" "memory" (memory $0 1))
 (table 0 anyfunc)
 (export "__build_gaussian_coefs" (func $__build_gaussian_coefs))
 (export "__gauss16_line" (func $__gauss16_line))
 (export "blurMono16" (func $blurMono16))
 (export "hsl_l16" (func $hsl_l16))
 (export "unsharp" (func $unsharp))
 (func $__build_gaussian_coefs (param $0 f32) (param $1 i32)
  (local $2 f64)
  (local $3 f64)
  (local $4 f64)
  (local $5 f64)
  (local $6 f64)
  (local $7 f64)
  (f32.store offset=16
   (get_local $1)
   (f32.demote/f64
    (tee_local $5
     (f64.add
      (tee_local $3
       (call $exp
        (f64.neg
         (tee_local $2
          (f64.div
           (f64.const 1.6939718862199047)
           (f64.promote/f32
            (get_local $0)
           )
          )
         )
        )
       )
      )
      (get_local $3)
     )
    )
   )
  )
  (f32.store offset=20
   (get_local $1)
   (f32.neg
    (f32.demote/f64
     (tee_local $4
      (call $exp
       (f64.mul
        (get_local $2)
        (f64.const -2)
       )
      )
     )
    )
   )
  )
  (f32.store
   (get_local $1)
   (f32.demote/f64
    (tee_local $6
     (f64.div
      (f64.mul
       (tee_local $6
        (f64.sub
         (f64.const 1)
         (get_local $3)
        )
       )
       (get_local $6)
      )
      (f64.sub
       (f64.add
        (f64.mul
         (get_local $3)
         (f64.add
          (get_local $2)
          (get_local $2)
         )
        )
        (f64.const 1)
       )
       (get_local $4)
      )
     )
    )
   )
  )
  (f32.store offset=4
   (get_local $1)
   (f32.demote/f64
    (tee_local $7
     (f64.mul
      (get_local $3)
      (f64.mul
       (f64.add
        (get_local $2)
        (f64.const -1)
       )
       (get_local $6)
      )
     )
    )
   )
  )
  (f32.store offset=8
   (get_local $1)
   (f32.demote/f64
    (tee_local $2
     (f64.mul
      (get_local $3)
      (f64.mul
       (f64.add
        (get_local $2)
        (f64.const 1)
       )
       (get_local $6)
      )
     )
    )
   )
  )
  (f32.store offset=12
   (get_local $1)
   (f32.neg
    (f32.demote/f64
     (tee_local $3
      (f64.mul
       (get_local $4)
       (get_local $6)
      )
     )
    )
   )
  )
  (f32.store offset=24
   (get_local $1)
   (f32.demote/f64
    (f64.div
     (f64.add
      (get_local $6)
      (get_local $7)
     )
     (tee_local $6
      (f64.add
       (get_local $4)
       (f64.sub
        (f64.const 1)
        (get_local $5)
       )
      )
     )
    )
   )
  )
  (f32.store offset=28
   (get_local $1)
   (f32.demote/f64
    (f64.div
     (f64.sub
      (get_local $2)
      (get_local $3)
     )
     (get_local $6)
    )
   )
  )
 )
 (func $__gauss16_line (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (param $4 i32) (param $5 i32)
  (local $6 f32)
  (local $7 f32)
  (local $8 f32)
  (local $9 f32)
  (local $10 f64)
  (local $11 f64)
  (local $12 f64)
  (local $13 f64)
  (local $14 i32)
  (local $15 f64)
  (local $16 f64)
  (local $17 f64)
  (local $18 f64)
  (local $19 i32)
  (local $20 i32)
  (set_local $9
   (f32.load offset=20
    (get_local $3)
   )
  )
  (set_local $8
   (f32.load offset=16
    (get_local $3)
   )
  )
  (set_local $7
   (f32.load offset=12
    (get_local $3)
   )
  )
  (set_local $6
   (f32.load offset=8
    (get_local $3)
   )
  )
  (block $label$0
   (br_if $label$0
    (tee_local $20
     (i32.lt_s
      (tee_local $14
       (i32.add
        (get_local $4)
        (i32.const -1)
       )
      )
      (i32.const 0)
     )
    )
   )
   (f32.store
    (get_local $2)
    (f32.demote/f64
     (tee_local $16
      (f64.add
       (f64.mul
        (tee_local $18
         (f64.mul
          (tee_local $17
           (f64.convert_u/i32
            (i32.load16_u
             (get_local $0)
            )
           )
          )
          (f64.promote/f32
           (f32.load offset=24
            (get_local $3)
           )
          )
         )
        )
        (tee_local $15
         (f64.promote/f32
          (get_local $9)
         )
        )
       )
       (f64.add
        (f64.mul
         (get_local $18)
         (tee_local $12
          (f64.promote/f32
           (get_local $8)
          )
         )
        )
        (f64.add
         (f64.mul
          (get_local $17)
          (tee_local $11
           (f64.promote/f32
            (f32.load offset=4
             (get_local $3)
            )
           )
          )
         )
         (f64.mul
          (tee_local $10
           (f64.promote/f32
            (f32.load
             (get_local $3)
            )
           )
          )
          (get_local $17)
         )
        )
       )
      )
     )
    )
   )
   (set_local $2
    (i32.add
     (get_local $2)
     (i32.const 4)
    )
   )
   (set_local $0
    (i32.add
     (get_local $0)
     (i32.const 2)
    )
   )
   (br_if $label$0
    (i32.eqz
     (get_local $14)
    )
   )
   (set_local $19
    (get_local $4)
   )
   (loop $label$1
    (f32.store
     (get_local $2)
     (f32.demote/f64
      (tee_local $16
       (f64.add
        (f64.mul
         (get_local $18)
         (get_local $15)
        )
        (f64.add
         (f64.mul
          (tee_local $18
           (get_local $16)
          )
          (get_local $12)
         )
         (f64.add
          (f64.mul
           (get_local $17)
           (get_local $11)
          )
          (f64.mul
           (get_local $10)
           (tee_local $17
            (f64.convert_u/i32
             (i32.load16_u
              (get_local $0)
             )
            )
           )
          )
         )
        )
       )
      )
     )
    )
    (set_local $2
     (i32.add
      (get_local $2)
      (i32.const 4)
     )
    )
    (set_local $0
     (i32.add
      (get_local $0)
      (i32.const 2)
     )
    )
    (set_local $18
     (get_local $18)
    )
    (br_if $label$1
     (i32.gt_s
      (tee_local $19
       (i32.add
        (get_local $19)
        (i32.const -1)
       )
      )
      (i32.const 1)
     )
    )
   )
  )
  (block $label$2
   (br_if $label$2
    (get_local $20)
   )
   (i32.store16
    (i32.add
     (get_local $1)
     (i32.shl
      (i32.mul
       (get_local $14)
       (get_local $5)
      )
      (i32.const 1)
     )
    )
    (i32.trunc_u/f64
     (f64.add
      (tee_local $16
       (f64.add
        (f64.add
         (f64.add
          (f64.mul
           (tee_local $17
            (f64.convert_u/i32
             (tee_local $20
              (i32.load16_u
               (i32.add
                (get_local $0)
                (i32.const -2)
               )
              )
             )
            )
           )
           (tee_local $12
            (f64.promote/f32
             (get_local $7)
            )
           )
          )
          (f64.mul
           (get_local $17)
           (tee_local $11
            (f64.promote/f32
             (get_local $6)
            )
           )
          )
         )
         (f64.mul
          (tee_local $18
           (f64.mul
            (get_local $17)
            (f64.promote/f32
             (f32.load offset=28
              (get_local $3)
             )
            )
           )
          )
          (tee_local $10
           (f64.promote/f32
            (get_local $8)
           )
          )
         )
        )
        (f64.mul
         (get_local $18)
         (tee_local $13
          (f64.promote/f32
           (get_local $9)
          )
         )
        )
       )
      )
      (f64.promote/f32
       (f32.load
        (i32.add
         (get_local $2)
         (i32.const -4)
        )
       )
      )
     )
    )
   )
   (br_if $label$2
    (i32.eqz
     (get_local $14)
    )
   )
   (set_local $2
    (i32.add
     (get_local $2)
     (i32.const -8)
    )
   )
   (set_local $0
    (i32.add
     (get_local $0)
     (i32.const -4)
    )
   )
   (set_local $14
    (i32.sub
     (i32.const 0)
     (i32.shl
      (get_local $5)
      (i32.const 1)
     )
    )
   )
   (set_local $19
    (i32.add
     (get_local $1)
     (i32.mul
      (get_local $5)
      (i32.add
       (i32.shl
        (get_local $4)
        (i32.const 1)
       )
       (i32.const -4)
      )
     )
    )
   )
   (loop $label$3
    (set_local $3
     (i32.and
      (get_local $20)
      (i32.const 65535)
     )
    )
    (set_local $20
     (i32.load16_u
      (get_local $0)
     )
    )
    (i32.store16
     (get_local $19)
     (i32.trunc_u/f64
      (f64.add
       (tee_local $16
        (f64.add
         (f64.add
          (f64.add
           (f64.mul
            (get_local $17)
            (get_local $12)
           )
           (f64.mul
            (tee_local $17
             (f64.convert_u/i32
              (get_local $3)
             )
            )
            (get_local $11)
           )
          )
          (f64.mul
           (tee_local $15
            (get_local $16)
           )
           (get_local $10)
          )
         )
         (f64.mul
          (get_local $18)
          (get_local $13)
         )
        )
       )
       (f64.promote/f32
        (f32.load
         (get_local $2)
        )
       )
      )
     )
    )
    (set_local $19
     (i32.add
      (get_local $19)
      (get_local $14)
     )
    )
    (set_local $0
     (i32.add
      (get_local $0)
      (i32.const -2)
     )
    )
    (set_local $2
     (i32.add
      (get_local $2)
      (i32.const -4)
     )
    )
    (set_local $18
     (get_local $15)
    )
    (br_if $label$3
     (i32.gt_s
      (tee_local $4
       (i32.add
        (get_local $4)
        (i32.const -1)
       )
      )
      (i32.const 1)
     )
    )
   )
  )
 )
 (func $blurMono16 (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (param $4 i32) (param $5 i32) (param $6 i32) (param $7 f32)
  (local $8 i32)
  (local $9 f64)
  (local $10 f64)
  (local $11 f64)
  (local $12 f64)
  (local $13 f64)
  (local $14 f64)
  (local $15 i32)
  (local $16 i32)
  (block $label$0
   (br_if $label$0
    (f32.eq
     (get_local $7)
     (f32.const 0)
    )
   )
   (f32.store offset=16
    (get_local $4)
    (f32.demote/f64
     (tee_local $12
      (f64.add
       (tee_local $10
        (call $exp
         (f64.neg
          (tee_local $9
           (f64.div
            (f64.const 1.6939718862199047)
            (f64.promote/f32
             (f32.max
              (get_local $7)
              (f32.const 0.5)
             )
            )
           )
          )
         )
        )
       )
       (get_local $10)
      )
     )
    )
   )
   (f32.store offset=20
    (get_local $4)
    (f32.neg
     (f32.demote/f64
      (tee_local $11
       (call $exp
        (f64.mul
         (get_local $9)
         (f64.const -2)
        )
       )
      )
     )
    )
   )
   (f32.store
    (get_local $4)
    (f32.demote/f64
     (tee_local $13
      (f64.div
       (f64.mul
        (tee_local $13
         (f64.sub
          (f64.const 1)
          (get_local $10)
         )
        )
        (get_local $13)
       )
       (f64.sub
        (f64.add
         (f64.mul
          (get_local $10)
          (f64.add
           (get_local $9)
           (get_local $9)
          )
         )
         (f64.const 1)
        )
        (get_local $11)
       )
      )
     )
    )
   )
   (f32.store offset=4
    (get_local $4)
    (f32.demote/f64
     (tee_local $14
      (f64.mul
       (get_local $10)
       (f64.mul
        (f64.add
         (get_local $9)
         (f64.const -1)
        )
        (get_local $13)
       )
      )
     )
    )
   )
   (f32.store offset=8
    (get_local $4)
    (f32.demote/f64
     (tee_local $9
      (f64.mul
       (get_local $10)
       (f64.mul
        (f64.add
         (get_local $9)
         (f64.const 1)
        )
        (get_local $13)
       )
      )
     )
    )
   )
   (f32.store offset=12
    (get_local $4)
    (f32.neg
     (f32.demote/f64
      (tee_local $10
       (f64.mul
        (get_local $11)
        (get_local $13)
       )
      )
     )
    )
   )
   (f32.store offset=24
    (get_local $4)
    (f32.demote/f64
     (f64.div
      (f64.add
       (get_local $13)
       (get_local $14)
      )
      (tee_local $13
       (f64.add
        (get_local $11)
        (f64.sub
         (f64.const 1)
         (get_local $12)
        )
       )
      )
     )
    )
   )
   (f32.store offset=28
    (get_local $4)
    (f32.demote/f64
     (f64.div
      (f64.sub
       (get_local $9)
       (get_local $10)
      )
      (get_local $13)
     )
    )
   )
   (block $label$1
    (br_if $label$1
     (i32.eqz
      (get_local $6)
     )
    )
    (set_local $8
     (i32.shl
      (get_local $5)
      (i32.const 1)
     )
    )
    (set_local $15
     (get_local $6)
    )
    (set_local $16
     (get_local $2)
    )
    (loop $label$2
     (call $__gauss16_line
      (get_local $0)
      (get_local $16)
      (get_local $3)
      (get_local $4)
      (get_local $5)
      (get_local $6)
     )
     (set_local $0
      (i32.add
       (get_local $0)
       (get_local $8)
      )
     )
     (set_local $16
      (i32.add
       (get_local $16)
       (i32.const 2)
      )
     )
     (br_if $label$2
      (tee_local $15
       (i32.add
        (get_local $15)
        (i32.const -1)
       )
      )
     )
    )
   )
   (br_if $label$0
    (i32.eqz
     (get_local $5)
    )
   )
   (set_local $16
    (i32.shl
     (get_local $6)
     (i32.const 1)
    )
   )
   (set_local $0
    (get_local $5)
   )
   (loop $label$3
    (call $__gauss16_line
     (get_local $2)
     (get_local $1)
     (get_local $3)
     (get_local $4)
     (get_local $6)
     (get_local $5)
    )
    (set_local $2
     (i32.add
      (get_local $2)
      (get_local $16)
     )
    )
    (set_local $1
     (i32.add
      (get_local $1)
      (i32.const 2)
     )
    )
    (br_if $label$3
     (tee_local $0
      (i32.add
       (get_local $0)
       (i32.const -1)
      )
     )
    )
   )
  )
 )
 (func $hsl_l16 (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 i32)
  (local $7 i32)
  (local $8 i32)
  (block $label$0
   (br_if $label$0
    (i32.eqz
     (tee_local $3
      (i32.mul
       (get_local $3)
       (get_local $2)
      )
     )
    )
   )
   (set_local $7
    (i32.sub
     (i32.const 0)
     (get_local $3)
    )
   )
   (loop $label$1
    (set_local $2
     (i32.and
      (tee_local $4
       (i32.shr_u
        (tee_local $5
         (i32.load
          (get_local $0)
         )
        )
        (i32.const 8)
       )
      )
      (i32.const 255)
     )
    )
    (block $label$2
     (block $label$3
      (br_if $label$3
       (i32.lt_u
        (tee_local $3
         (i32.and
          (get_local $5)
          (i32.const 255)
         )
        )
        (tee_local $6
         (i32.and
          (tee_local $5
           (i32.shr_u
            (get_local $5)
            (i32.const 16)
           )
          )
          (i32.const 255)
         )
        )
       )
      )
      (set_local $8
       (get_local $3)
      )
      (br_if $label$2
       (i32.ge_u
        (get_local $3)
        (get_local $2)
       )
      )
     )
     (set_local $8
      (i32.and
       (select
        (get_local $5)
        (select
         (get_local $5)
         (get_local $4)
         (i32.lt_u
          (get_local $2)
          (get_local $3)
         )
        )
        (i32.lt_u
         (get_local $2)
         (get_local $6)
        )
       )
       (i32.const 255)
      )
     )
    )
    (block $label$4
     (block $label$5
      (br_if $label$5
       (i32.gt_u
        (get_local $3)
        (get_local $2)
       )
      )
      (br_if $label$4
       (i32.le_u
        (get_local $3)
        (get_local $6)
       )
      )
     )
     (set_local $3
      (i32.and
       (select
        (get_local $5)
        (select
         (get_local $4)
         (get_local $5)
         (i32.ge_u
          (get_local $3)
          (get_local $2)
         )
        )
        (i32.gt_u
         (get_local $2)
         (get_local $6)
        )
       )
       (i32.const 255)
      )
     )
    )
    (set_local $0
     (i32.add
      (get_local $0)
      (i32.const 4)
     )
    )
    (i32.store16
     (get_local $1)
     (i32.shr_u
      (i32.mul
       (i32.add
        (get_local $3)
        (get_local $8)
       )
       (i32.const 257)
      )
      (i32.const 1)
     )
    )
    (set_local $1
     (i32.add
      (get_local $1)
      (i32.const 2)
     )
    )
    (br_if $label$1
     (tee_local $7
      (i32.add
       (get_local $7)
       (i32.const 1)
      )
     )
    )
   )
  )
 )
 (func $unsharp (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (param $4 i32) (param $5 i32) (param $6 i32) (param $7 i32)
  (local $8 i32)
  (local $9 i32)
  (local $10 i32)
  (local $11 i32)
  (local $12 i32)
  (local $13 i32)
  (local $14 i32)
  (local $15 i32)
  (local $16 i32)
  (local $17 i32)
  (set_local $8
   (i32.trunc_s/f64
    (f64.add
     (f64.promote/f32
      (f32.div
       (f32.mul
        (f32.convert_u/i32
         (get_local $6)
        )
        (f32.const 4096)
       )
       (f32.const 100)
      )
     )
     (f64.const 0.5)
    )
   )
  )
  (block $label$0
   (br_if $label$0
    (i32.eqz
     (tee_local $13
      (i32.mul
       (get_local $5)
       (get_local $4)
      )
     )
    )
   )
   (set_local $9
    (i32.mul
     (get_local $7)
     (i32.const 257)
    )
   )
   (loop $label$1
    (block $label$2
     (br_if $label$2
      (i32.lt_u
       (select
        (i32.sub
         (i32.const 0)
         (tee_local $7
          (i32.shl
           (tee_local $6
            (i32.sub
             (i32.load16_u
              (get_local $2)
             )
             (i32.load16_u
              (get_local $3)
             )
            )
           )
           (i32.const 1)
          )
         )
        )
        (get_local $7)
        (i32.lt_s
         (get_local $6)
         (i32.const 0)
        )
       )
       (get_local $9)
      )
     )
     (set_local $5
      (i32.load8_u
       (i32.add
        (get_local $0)
        (i32.const 2)
       )
      )
     )
     (block $label$3
      (block $label$4
       (br_if $label$4
        (tee_local $17
         (i32.lt_u
          (tee_local $6
           (i32.load8_u
            (get_local $0)
           )
          )
          (tee_local $4
           (i32.load8_u
            (i32.add
             (get_local $0)
             (i32.const 1)
            )
           )
          )
         )
        )
       )
       (set_local $14
        (get_local $6)
       )
       (br_if $label$3
        (i32.ge_u
         (get_local $6)
         (get_local $5)
        )
       )
      )
      (set_local $14
       (select
        (get_local $5)
        (select
         (get_local $5)
         (get_local $4)
         (i32.lt_u
          (get_local $4)
          (get_local $5)
         )
        )
        (i32.gt_u
         (get_local $6)
         (get_local $4)
        )
       )
      )
     )
     (block $label$5
      (block $label$6
       (br_if $label$6
        (i32.gt_u
         (get_local $6)
         (get_local $4)
        )
       )
       (set_local $15
        (get_local $6)
       )
       (br_if $label$5
        (i32.le_u
         (get_local $6)
         (get_local $5)
        )
       )
      )
      (set_local $15
       (select
        (get_local $5)
        (select
         (get_local $5)
         (get_local $4)
         (i32.gt_u
          (get_local $4)
          (get_local $5)
         )
        )
        (get_local $17)
       )
      )
     )
     (set_local $12
      (i32.shr_u
       (tee_local $11
        (i32.mul
         (tee_local $10
          (i32.add
           (get_local $15)
           (get_local $14)
          )
         )
         (i32.const 257)
        )
       )
       (i32.const 1)
      )
     )
     (set_local $16
      (i32.const 0)
     )
     (set_local $17
      (i32.const 0)
     )
     (block $label$7
      (br_if $label$7
       (i32.eq
        (get_local $14)
        (get_local $15)
       )
      )
      (set_local $16
       (i32.div_s
        (i32.mul
         (tee_local $17
          (i32.sub
           (get_local $14)
           (get_local $15)
          )
         )
         (i32.const 4095)
        )
        (select
         (get_local $10)
         (i32.sub
          (i32.sub
           (i32.const 510)
           (get_local $14)
          )
          (get_local $15)
         )
         (i32.lt_u
          (get_local $11)
          (i32.const 65536)
         )
        )
       )
      )
      (block $label$8
       (br_if $label$8
        (i32.ne
         (get_local $6)
         (get_local $14)
        )
       )
       (set_local $17
        (i32.div_s
         (i32.mul
          (i32.sub
           (get_local $4)
           (get_local $5)
          )
          (i32.const 65535)
         )
         (i32.mul
          (get_local $17)
          (i32.const 6)
         )
        )
       )
       (br $label$7)
      )
      (set_local $17
       (i32.add
        (i32.div_s
         (i32.mul
          (select
           (i32.sub
            (get_local $5)
            (get_local $6)
           )
           (i32.sub
            (get_local $6)
            (get_local $4)
           )
           (tee_local $6
            (i32.eq
             (get_local $4)
             (get_local $14)
            )
           )
          )
          (i32.const 65535)
         )
         (i32.mul
          (get_local $17)
          (i32.const 6)
         )
        )
        (select
         (i32.const 21845)
         (i32.const 43690)
         (get_local $6)
        )
       )
      )
     )
     (set_local $6
      (select
       (tee_local $6
        (select
         (tee_local $6
          (i32.add
           (get_local $12)
           (i32.shr_s
            (i32.add
             (i32.mul
              (get_local $7)
              (get_local $8)
             )
             (i32.const 2048)
            )
            (i32.const 12)
           )
          )
         )
         (i32.const 0)
         (i32.gt_s
          (get_local $6)
          (i32.const 0)
         )
        )
       )
       (i32.const 65535)
       (i32.lt_s
        (get_local $6)
        (i32.const 65535)
       )
      )
     )
     (block $label$9
      (block $label$10
       (block $label$11
        (block $label$12
         (br_if $label$12
          (i32.eqz
           (tee_local $5
            (i32.and
             (get_local $16)
             (i32.const 65535)
            )
           )
          )
         )
         (br_if $label$11
          (i32.gt_s
           (get_local $6)
           (i32.const 32767)
          )
         )
         (set_local $5
          (i32.shr_u
           (i32.add
            (i32.mul
             (i32.add
              (get_local $5)
              (i32.const 4096)
             )
             (get_local $6)
            )
            (i32.const 2048)
           )
           (i32.const 12)
          )
         )
         (br $label$10)
        )
        (set_local $5
         (tee_local $6
          (i32.shr_u
           (get_local $6)
           (i32.const 8)
          )
         )
        )
        (set_local $4
         (get_local $6)
        )
        (br $label$9)
       )
       (set_local $5
        (i32.add
         (i32.shr_u
          (i32.add
           (i32.mul
            (get_local $5)
            (i32.xor
             (get_local $6)
             (i32.const 65535)
            )
           )
           (i32.const 2048)
          )
          (i32.const 12)
         )
         (get_local $6)
        )
       )
      )
      (set_local $7
       (i32.shr_u
        (get_local $5)
        (i32.const 8)
       )
      )
      (set_local $4
       (tee_local $6
        (i32.shr_u
         (i32.sub
          (i32.shl
           (get_local $6)
           (i32.const 1)
          )
          (get_local $5)
         )
         (i32.const 8)
        )
       )
      )
      (block $label$13
       (br_if $label$13
        (i32.gt_u
         (tee_local $5
          (i32.and
           (i32.add
            (get_local $17)
            (i32.const 21845)
           )
           (i32.const 65535)
          )
         )
         (i32.const 43689)
        )
       )
       (block $label$14
        (br_if $label$14
         (i32.lt_u
          (get_local $5)
          (i32.const 32767)
         )
        )
        (set_local $4
         (i32.add
          (i32.shr_u
           (i32.add
            (i32.mul
             (i32.mul
              (i32.sub
               (i32.const 43690)
               (get_local $5)
              )
              (i32.sub
               (get_local $7)
               (get_local $6)
              )
             )
             (i32.const 6)
            )
            (i32.const 32768)
           )
           (i32.const 16)
          )
          (get_local $6)
         )
        )
        (br $label$13)
       )
       (set_local $4
        (get_local $7)
       )
       (br_if $label$13
        (i32.gt_u
         (get_local $5)
         (i32.const 10921)
        )
       )
       (set_local $4
        (i32.add
         (i32.shr_u
          (i32.add
           (i32.mul
            (i32.mul
             (get_local $5)
             (i32.sub
              (get_local $7)
              (get_local $6)
             )
            )
            (i32.const 6)
           )
           (i32.const 32768)
          )
          (i32.const 16)
         )
         (get_local $6)
        )
       )
      )
      (set_local $5
       (get_local $6)
      )
      (block $label$15
       (br_if $label$15
        (i32.gt_u
         (tee_local $14
          (i32.and
           (get_local $17)
           (i32.const 65535)
          )
         )
         (i32.const 43689)
        )
       )
       (block $label$16
        (br_if $label$16
         (i32.lt_u
          (get_local $14)
          (i32.const 32767)
         )
        )
        (set_local $5
         (i32.add
          (i32.shr_u
           (i32.add
            (i32.mul
             (i32.mul
              (i32.sub
               (i32.const 43690)
               (get_local $14)
              )
              (i32.sub
               (get_local $7)
               (get_local $6)
              )
             )
             (i32.const 6)
            )
            (i32.const 32768)
           )
           (i32.const 16)
          )
          (get_local $6)
         )
        )
        (br $label$15)
       )
       (set_local $5
        (get_local $7)
       )
       (br_if $label$15
        (i32.gt_u
         (get_local $14)
         (i32.const 10921)
        )
       )
       (set_local $5
        (i32.add
         (i32.shr_u
          (i32.add
           (i32.mul
            (i32.mul
             (get_local $14)
             (i32.sub
              (get_local $7)
              (get_local $6)
             )
            )
            (i32.const 6)
           )
           (i32.const 32768)
          )
          (i32.const 16)
         )
         (get_local $6)
        )
       )
      )
      (br_if $label$9
       (i32.gt_u
        (tee_local $14
         (i32.and
          (i32.add
           (get_local $17)
           (i32.const 43691)
          )
          (i32.const 65535)
         )
        )
        (i32.const 43689)
       )
      )
      (block $label$17
       (br_if $label$17
        (i32.lt_u
         (get_local $14)
         (i32.const 32767)
        )
       )
       (set_local $6
        (i32.add
         (i32.shr_u
          (i32.add
           (i32.mul
            (i32.mul
             (i32.sub
              (i32.const 43690)
              (get_local $14)
             )
             (i32.sub
              (get_local $7)
              (get_local $6)
             )
            )
            (i32.const 6)
           )
           (i32.const 32768)
          )
          (i32.const 16)
         )
         (get_local $6)
        )
       )
       (br $label$9)
      )
      (block $label$18
       (br_if $label$18
        (i32.le_u
         (get_local $14)
         (i32.const 10921)
        )
       )
       (set_local $6
        (get_local $7)
       )
       (br $label$9)
      )
      (set_local $6
       (i32.add
        (i32.shr_u
         (i32.add
          (i32.mul
           (i32.mul
            (get_local $14)
            (i32.sub
             (get_local $7)
             (get_local $6)
            )
           )
           (i32.const 6)
          )
          (i32.const 32768)
         )
         (i32.const 16)
        )
        (get_local $6)
       )
      )
     )
     (i32.store8
      (get_local $1)
      (get_local $4)
     )
     (i32.store8
      (i32.add
       (get_local $1)
       (i32.const 1)
      )
      (get_local $5)
     )
     (i32.store8
      (i32.add
       (get_local $1)
       (i32.const 2)
      )
      (get_local $6)
     )
    )
    (set_local $3
     (i32.add
      (get_local $3)
      (i32.const 2)
     )
    )
    (set_local $2
     (i32.add
      (get_local $2)
      (i32.const 2)
     )
    )
    (set_local $0
     (i32.add
      (get_local $0)
      (i32.const 4)
     )
    )
    (set_local $1
     (i32.add
      (get_local $1)
      (i32.const 4)
     )
    )
    (br_if $label$1
     (tee_local $13
      (i32.add
       (get_local $13)
       (i32.const -1)
      )
     )
    )
   )
  )
 )
)
